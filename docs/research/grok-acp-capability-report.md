# Grok Build ACP capability probe

Date: 2026-07-09

## Environment

- Workspace: `/home/dev/Documents/happy`
- Probe directory: `/tmp/grok-acp-probe`
- Raw wire log: `/tmp/grok-acp-probe/wire-log.jsonl`
- Probe script: `/tmp/grok-acp-probe/probe-grok-acp.mjs`
- Grok binary: `/home/dev/.grok/bin/grok`
- Grok version: `0.2.93 (f00f96316d)`
- ACP protocol version used by Happy and probe: `1`
- Login preflight: `grok -p "say hi" --output-format json` succeeded in `/tmp/grok-acp-probe`.
- Important launch detail: `grok agent stdio --no-auto-update` fails on this Grok build with `unexpected argument '--no-auto-update'`; the working raw probe launch was `grok --no-auto-update agent stdio`. See `/tmp/grok-acp-probe/no-auto-update-flag-check.log`.

Happy-side context read before probing:

- `packages/happy-cli/src/agent/acp/AcpBackend.ts`: initializes with `protocolVersion: 1`, `clientCapabilities.fs.readTextFile/writeTextFile = false`; maps permission decisions by option ids/names; exposes `setSessionConfigOption`, `setSessionMode`, and `unstable_setSessionModel`.
- `packages/happy-cli/src/agent/acp/runAcp.ts`: extracts selectors from top-level `configOptions`, then legacy `modes`/`models`; sends model changes via config option first, then `session/set_model`.
- `packages/happy-cli/src/agent/acp/acpAgentConfig.ts`: no Grok entry yet.
- `docs/plans/codex-app-server-migration.md`: Codex baseline has per-turn model/policy overrides, structured approvals, clean interrupt, and stable thread id.

## Conclusion Matrix

| # | Probe item | Status | Evidence |
|---|---|---|---|
| 1 | `initialize` handshake | Supported | Sent `initialize` with protocol 1 at wire line 2. Grok returned `protocolVersion: 1`, `agentCapabilities.loadSession: true`, `promptCapabilities.embeddedContext: true`, and `mcpCapabilities.http/sse: true` at line 3. |
| 2 | `session/new` metadata | Partially supported | Sent `session/new` at line 4. Response at line 9 has top-level `models`, but no top-level `modes` or `configOptions`. Reasoning effort/model choices also appear in private `_meta["x.ai/sessionConfig"].options`. |
| 3 | Basic conversation | Supported | Sent `session/prompt` at line 10. Grok streamed `agent_message_chunk` at lines 52-56 and returned `stopReason: "end_turn"` at line 62. |
| 4 | Thinking stream | Supported | Grok streamed `agent_thought_chunk` in the basic prompt at lines 27-51 and again in the explicit thinking prompt at lines 79-99. |
| 5 | Tool call payload richness | Supported | Read/shell/edit produced standard `tool_call` and `tool_call_update`: read at lines 296/298, shell at 300/302, write/edit at 347/349/353. Payloads include `kind`, `title`, `locations`, `rawInput`, `rawOutput`, command/cwd, and diff content. |
| 6 | Permission request | Partially supported | Default mode requests permission for shell/edit. Allow path: request at line 303, client selected an allow option at 304, turn completed at 422. Reject path: request at line 488, client selected `reject-once` at 489, Grok returned `stopReason: "cancelled"` with `_meta.cancellationCategory: "PermissionRejected"` at 496. Options are Grok-style ids (`allow-once`, `reject-once`, `allow-edits-session`), not `proceed_once`/`proceed_always`/`cancel`. |
| 7 | Mode switching | Not supported as standard ACP modes | `session/new` line 9 contains no top-level `modes`. It has private `_meta["x.ai/sessionConfig"].options` entries for `high`/`medium`/`low`, but those are reasoning effort labels and are not exposed through standard ACP `modes` or `configOptions`; the probe therefore did not call `session/set_mode`. |
| 8 | Model switching | Partially supported | Model list is exposed at line 9. Probe called `session/set_model` for the only alternate model at line 497. Grok returned `MODEL_SWITCH_INCOMPATIBLE_AGENT` at line 498 because `grok-composer-2.5-fast` requires agent `cursor` while current session is `grok-build-plan`. |
| 9 | Cancel/interrupt | Supported | Long prompt sent at line 499. Probe sent `session/cancel` at line 507. Grok returned `stopReason: "cancelled"` and `_meta.cancellationCategory: "MidTurnAbort"` at line 511. A follow-up prompt at line 512 completed normally at line 569, so the process survived. |
| 10 | Session restore | Supported | `initialize` in the second process returned `loadSession: true` at line 573. Probe sent `session/load` at line 574. Grok replayed prior conversation/tool history at lines 578-616. Follow-up prompt returned the earlier file marker `RAIN-742` via message chunks at lines 679-683 and `end_turn` at 689. |
| 11 | Token/context usage | Supported via `_meta` | Prompt responses include `_meta.totalTokens`, `inputTokens`, `outputTokens`, `cachedReadTokens`, and `reasoningTokens`, for example line 62 and line 116. Streaming updates include `_meta.totalTokens`, for example line 27. No standard `usage_update` event appeared in the log. |
| 12 | Slash commands | Supported | `available_commands_update` appeared at line 12 and later line 684. Commands include `compact`, `always-approve`, `context`, `session-info`, `goal`, plus user/bundled skill commands. |
| 13 | Happy end-to-end smoke | Not verified | `happy acp -- grok agent stdio --no-auto-update` could not reach the ACP runner because this local Happy CLI has no credentials and stops at the authentication selector. Non-TTY run hit Ink raw-mode error; PTY run timed out at the auth prompt. Logs: `/tmp/grok-acp-probe/happy-acp-smoke.log` and `/tmp/grok-acp-probe/happy-acp-smoke-tty.log`. |

## Evidence Snippets

### Initialize

Wire lines 2-3:

```json
{"id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false}}}}
{"id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true,"promptCapabilities":{"image":false,"audio":false,"embeddedContext":true},"mcpCapabilities":{"http":true,"sse":true},"_meta":{"x.ai/fs_notify":true,"x.ai/hooks":{"blockingEvents":["pre_tool_use"],"decisions":["deny"]}}}}}
```

### Session Metadata

Wire line 9:

```json
{
  "sessionId": "019f46b8-9142-7b02-84e5-f154b3fe4db0",
  "models": {
    "currentModelId": "grok-4.5",
    "availableModels": [
      {"modelId": "grok-4.5", "name": "Grok 4.5", "_meta": {"totalContextTokens": 500000, "agentType": "grok-build-plan"}},
      {"modelId": "grok-composer-2.5-fast", "name": "Composer 2.5", "_meta": {"totalContextTokens": 200000, "agentType": "cursor"}}
    ]
  },
  "_meta": {
    "x.ai/sessionConfig": {
      "options": [
        {"id": "grok-4.5", "category": "model", "selected": true},
        {"id": "high", "category": "mode", "selected": true},
        {"id": "medium", "category": "mode", "selected": false},
        {"id": "low", "category": "mode", "selected": false}
      ]
    }
  }
}
```

### Prompt, Thinking, And Token Usage

Wire lines 52-62:

```json
{"method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"ACP"}},"_meta":{"totalTokens":2522}}}
{"id":3,"result":{"stopReason":"end_turn","_meta":{"totalTokens":12467,"modelId":"grok-4.5","inputTokens":12430,"outputTokens":37,"cachedReadTokens":11136,"reasoningTokens":28}}}
```

Wire lines 79-80 show thinking:

```json
{"method":"session/update","params":{"update":{"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"I"}},"_meta":{"totalTokens":12625}}}
```

### Tool Calls And Permissions

Wire lines 300-304 show shell execution request and approval:

```json
{"method":"session/update","params":{"update":{"sessionUpdate":"tool_call","title":"run_terminal_command","rawInput":{"command":"printf ACP_SHELL_OK","description":"Run printf ACP_SHELL_OK exactly"}}}}
{"method":"session/update","params":{"update":{"sessionUpdate":"tool_call_update","kind":"execute","title":"Execute `printf ACP_SHELL_OK`","rawInput":{"variant":"Bash","command":"printf ACP_SHELL_OK","is_background":false}}}}
{"id":0,"method":"session/request_permission","params":{"toolCall":{"kind":"execute","title":"Execute `printf ACP_SHELL_OK`","rawInput":{"command":"printf ACP_SHELL_OK"}},"options":[{"optionId":"allow-once","kind":"allow_once"},{"optionId":"reject-once","kind":"reject_once"}]}}
{"id":0,"result":{"outcome":{"outcome":"selected","optionId":"allow-once"}}}
```

Wire lines 347-353 show edit diff and approval:

```json
{"method":"session/update","params":{"update":{"sessionUpdate":"tool_call","title":"write","rawInput":{"file_path":"/tmp/grok-acp-probe/edit-target.txt","content":"status=modified\ncolor=blue\nprobe=done\n"}}}}
{"method":"session/update","params":{"update":{"sessionUpdate":"tool_call_update","kind":"edit","title":"Write `/tmp/grok-acp-probe/edit-target.txt`","content":[{"type":"diff","path":"/tmp/grok-acp-probe/edit-target.txt","oldText":"","newText":"status=modified\ncolor=blue\nprobe=done\n"}],"locations":[{"path":"/tmp/grok-acp-probe/edit-target.txt"}]}}}
{"id":1,"method":"session/request_permission","params":{"toolCall":{"kind":"edit","title":"Write `/tmp/grok-acp-probe/edit-target.txt`","rawInput":{"variant":"Write","file_path":"/tmp/grok-acp-probe/edit-target.txt","content":"status=modified\ncolor=blue\nprobe=done\n"}},"options":[{"optionId":"allow-edits-session","kind":"allow_always"},{"optionId":"allow-once","kind":"allow_once"},{"optionId":"reject-once","kind":"reject_once"}]}}
{"method":"session/update","params":{"update":{"sessionUpdate":"tool_call_update","status":"completed","content":[{"type":"diff","oldText":"status=original\ncolor=blue\n","newText":"status=modified\ncolor=blue\nprobe=done\n"}]}}}
```

Wire lines 488-496 show rejection behavior:

```json
{"id":2,"method":"session/request_permission","params":{"toolCall":{"kind":"execute","title":"Execute `printf ACP_REJECT_SHOULD_NOT_RUN`","rawInput":{"command":"printf ACP_REJECT_SHOULD_NOT_RUN"}},"options":[{"optionId":"allow-once","kind":"allow_once"},{"optionId":"reject-once","kind":"reject_once"}]}}
{"id":2,"result":{"outcome":{"outcome":"selected","optionId":"reject-once"}}}
{"method":"session/update","params":{"update":{"sessionUpdate":"tool_call_update","status":"failed","content":[{"type":"content","content":{"type":"text","text":"User rejected the execution for tool `run_terminal_command`"}}]}}}
{"id":6,"result":{"stopReason":"cancelled","_meta":{"cancellationCategory":"PermissionRejected"}}}
```

### Model Switch

Wire lines 497-498:

```json
{"id":7,"method":"session/set_model","params":{"sessionId":"019f46b8-9142-7b02-84e5-f154b3fe4db0","modelId":"grok-composer-2.5-fast"}}
{"id":7,"error":{"code":-32600,"message":"Cannot switch to model 'grok-composer-2.5-fast': it requires agent 'cursor' but the active agent is 'grok-build-plan'. Start a new session to use this model.","data":{"code":"MODEL_SWITCH_INCOMPATIBLE_AGENT","suggestion":"start_new_session"}}}
```

### Cancel

Wire lines 499-511:

```json
{"id":8,"method":"session/prompt","params":{"prompt":[{"type":"text","text":"Start a long response..."}]}}
{"method":"session/cancel","params":{"sessionId":"019f46b8-9142-7b02-84e5-f154b3fe4db0"}}
{"id":8,"result":{"stopReason":"cancelled","_meta":{"cancellationCategory":"MidTurnAbort"}}}
```

Wire lines 512-569 show the next prompt completed after cancel:

```json
{"id":9,"method":"session/prompt","params":{"prompt":[{"type":"text","text":"Reply with exactly: ACP_AFTER_CANCEL_OK"}]}}
{"id":9,"result":{"stopReason":"end_turn","_meta":{"totalTokens":13314,"modelId":"grok-4.5"}}}
```

### Session Load

Wire lines 573-616:

```json
{"id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true}}}
{"id":2,"method":"session/load","params":{"cwd":"/tmp/grok-acp-probe","mcpServers":[],"sessionId":"019f46b8-9142-7b02-84e5-f154b3fe4db0"}}
{"method":"session/update","params":{"update":{"sessionUpdate":"tool_call","kind":"read","title":"Read `/tmp/grok-acp-probe/notes.txt`"}}}
{"id":2,"result":{"models":{"currentModelId":"grok-4.5","availableModels":[{"modelId":"grok-4.5"},{"modelId":"grok-composer-2.5-fast"}]}}}
```

Wire lines 679-689 confirm context after load:

```json
{"method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"RAIN"}}}}
{"method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"-742"}}}}
{"id":3,"result":{"stopReason":"end_turn","_meta":{"totalTokens":13453,"modelId":"grok-4.5"}}}
```

### Slash Commands

Wire line 12:

```json
{"method":"session/update","params":{"update":{"sessionUpdate":"available_commands_update","availableCommands":[{"name":"compact"},{"name":"always-approve"},{"name":"context"},{"name":"session-info"},{"name":"goal"}],"_meta":{"tools":["run_terminal_command","read_file","search_replace","write"]}}}}
```

The full line also included user and bundled skill commands such as `docx`, `xlsx`, `design`, `review`, `execute-plan`, and `implement`.

## Four Known Gaps

### 1. Session Recovery

Grok side: supported. `initialize` advertises `loadSession: true`, `session/load` works across process restart, and loaded context answered with the earlier `RAIN-742` marker.

Happy impact: the generic ACP backend currently always creates a new ACP session in `startSession()` and does not expose a resume/load path analogous to Codex app-server thread resume. Without runner work, Happy cannot preserve Grok context across CLI restarts even though Grok can.

Runner work: persist the Grok ACP `sessionId` in Happy session metadata, add an ACP resume path that calls `session/load` when reconnecting, and replay/merge the streamed history without duplicating Happy-side events.

### 2. Permission And Sandbox Granularity

Grok side: per-tool permission requests are solid and structured. Shell permission includes `rawInput.command`, description, and later `rawOutput.current_dir`. Edit calls include file paths and diff content in `tool_call_update`. The permission request itself includes the new file content/path but not always the final old/new diff; the diff arrives as adjacent tool-call updates.

Grok does not expose standard ACP `modes` for permission/sandbox profiles. Private `_meta["x.ai/sessionConfig"]` has `high`/`medium`/`low`, but these are reasoning-effort-like modes, not approval/sandbox modes.

Happy impact: Happy can render useful tool cards, but current permission response mapping is risky. `AcpBackend` looks for `proceed_once`, `proceed_always`, and `cancel`; Grok sends `allow-once`, `allow-edits-session`, and `reject-once`. Approval often works via fallback to the first option, but denial will likely respond with non-existent `cancel`, instead of `reject-once`.

Runner work: choose ACP permission response option by `kind` first (`allow_once`, `allow_always`, `reject_once`, `reject_always`), then id/name fallback. Preserve/forward `rawInput`, `_meta["x.ai/tool"]`, locations, and diff content for UI. Do not present private `high`/`medium`/`low` as sandbox modes unless intentionally mapped as reasoning effort.

### 3. Model Selection

Grok side: model list is reported in top-level `models` and in initialize `_meta.modelState`. However no standard `configOptions` model selector was returned. `session/set_model` exists but switching to the only alternate model failed with `MODEL_SWITCH_INCOMPATIBLE_AGENT`, because that model requires a different agent type.

Happy impact: Happy's legacy `models` extraction should display `grok-4.5` and `grok-composer-2.5-fast`, but selecting Composer in this session will fail. This is weaker than Codex app-server per-turn model override because some Grok model changes require a new session/agent.

Runner work: surface model switch failures clearly, consider hiding or annotating models whose `_meta.agentType` differs from the active model, and consider starting a new Grok session with `-m` only if product semantics allow context loss.

### 4. Token Usage

Grok side: supported via `_meta`, not via standard `usage_update` in this run. Prompt responses include `totalTokens`, `inputTokens`, `outputTokens`, `cachedReadTokens`, and `reasoningTokens`. Stream updates include `_meta.totalTokens`. Model metadata includes total context window size (`totalContextTokens`).

Happy impact: current generic ACP handling does not appear to emit `token-count` from prompt response `_meta` or update `_meta`; `sendPrompt()` awaits `connection.prompt()` but discards the `PromptResponse`. Happy will likely miss token/context telemetry unless runner code is extended.

Runner work: capture `PromptResponse._meta` from `connection.prompt()`, parse token fields from `session/update.params._meta`, and map them into Happy `token-count` or session metadata. Prefer standard `usage`/`usage_update` when present, with Grok `_meta` as provider-specific fallback.

## Final Recommendation

Recommendation: **conditionally integrate** Grok ACP.

Grok's ACP implementation is good enough for a first integration if Happy accepts a few provider-specific edges. The core loop works: initialize, new session, streaming text/thoughts, tool calls, approvals, rejection, cancel, slash commands, load-session recovery, and token metadata all have wire evidence.

Conditions before user-facing rollout:

1. Add a known Grok config using the working argv order: `grok --no-auto-update agent stdio` (or omit the flag if relying on PATH/user command). The documented/user-requested `grok agent stdio --no-auto-update` is rejected by Grok 0.2.93.
2. Fix ACP permission option selection to use `PermissionOption.kind`, especially for reject (`reject-once`) and approve-for-session (`allow-edits-session`).
3. Add ACP session load/resume support and persist the provider ACP session id.
4. Add Grok token metadata extraction from `_meta`.
5. Treat Grok's private `_meta["x.ai/sessionConfig"]` carefully: it is useful for reasoning effort/model annotations, but it is not standard ACP `configOptions`.
6. Decide product behavior for incompatible model switches: show a disabled model, show a failure toast, or start a new session with explicit context-loss warning.
7. Re-run Happy end-to-end smoke after local Happy credentials are available. The raw Grok ACP probe passed, but the Happy runner smoke did not reach Grok because this machine is not authenticated to Happy.

Estimated runner-side change list:

- `acpAgentConfig.ts`: add `grok: { command: 'grok', args: ['--no-auto-update', 'agent', 'stdio'] }`, or document `happy acp -- grok --no-auto-update agent stdio` style usage.
- `AcpBackend.requestPermission`: map selected options by `kind`, not Codex/Gemini-specific ids.
- `AcpBackend.sendPrompt` / session update handling: retain `PromptResponse` and emit token-count from `usage` or `_meta`.
- ACP resume path: call `session/load` when an existing ACP session id is known.
- Metadata extraction: optionally parse Grok `_meta.modelState` and `_meta["x.ai/sessionConfig"]` as provider-specific annotations, without replacing standard `models`/`modes`.

## Artifacts

- Raw wire log: `/tmp/grok-acp-probe/wire-log.jsonl`
- Probe summary: `/tmp/grok-acp-probe/probe-summary.json`
- Probe script: `/tmp/grok-acp-probe/probe-grok-acp.mjs`
- `--no-auto-update` flag check: `/tmp/grok-acp-probe/no-auto-update-flag-check.log`
- Happy smoke logs: `/tmp/grok-acp-probe/happy-acp-smoke.log`, `/tmp/grok-acp-probe/happy-acp-smoke-tty.log`
