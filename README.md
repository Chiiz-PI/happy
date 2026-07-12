<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/.github/logotype-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="/.github/logotype-light.png">
    <img src="/.github/logotype-dark.png" width="400" alt="Happy">
  </picture>
</div>

<h1 align="center">
  Mobile and Web Client for Claude Code, Codex & more
</h1>

<h4 align="center">
Use Claude Code, Codex, Gemini, Grok and other coding agents from anywhere with end-to-end encryption.
</h4>

<div align="center">

[📱 **iOS App**](https://apps.apple.com/us/app/happy-claude-code-client/id6748571505) • [🤖 **Android App**](https://play.google.com/store/apps/details?id=com.ex3ndr.happy) • [🌐 **Web App**](https://app.happy.engineering) • [🎥 **See a Demo**](https://youtu.be/GCS0OG9QMSE) • [📚 **Documentation**](https://happy.engineering/docs/) • [💬 **Discord**](https://discord.gg/fX9WBAhyfD)

</div>

<img width="5178" height="2364" alt="github" src="/.github/header.png" />

## 🍴 About this branch

You are on **`spport-grok-cli`** — the Grok integration branch of [Chiiz-PI's fork](https://github.com/Chiiz-PI/happy) of [slopus/happy](https://github.com/slopus/happy). On top of the fork's `main` (which adds a directory browser and local-session resume to the new-session flow), this branch integrates the **xAI Grok Build CLI** as a first-class ACP agent, plus a set of generic ACP runner improvements that benefit every ACP agent.

It is kept as a standalone branch (no upstream PR, not merged into `main` yet) while the grok CLI itself is still iterating quickly — see [Status](#status) below.

## ⚡ Grok support

### Usage

```bash
# grok CLI must be installed and logged in first
happy grok                          # start a Grok session (equivalent to: happy acp grok)
happy grok --model <model>          # pick a model at launch
happy grok --permission-mode acceptEdits        # auto-approve edit tools
happy grok --permission-mode bypassPermissions  # auto-approve everything (yolo)
happy grok --resume <acp-session-id>            # resume a provider session
happy acp -- grok --no-auto-update agent stdio  # raw passthrough escape hatch
```

Under the hood Happy launches `grok --no-auto-update agent stdio` and speaks the [Agent Client Protocol](https://agentclientprotocol.com). The Grok flavor shows up with its own branding in the app, and `grok` availability is reported on the machine page.

### What works

- **Full session flow** — streaming replies with thinking, tool cards (read/shell/edit with diffs), slash commands, cancel/interrupt.
- **Correct permission handling** — approve / approve-for-session / deny all behave correctly on the Grok side. This came from a generic fix: ACP permission options are now matched by `kind` (`allow_once` / `allow_always` / `reject_once` / …) before falling back to the id heuristics that only fit Codex/Gemini. The app also sends explicit decision-style responses for generic ACP sessions.
- **Client-side permission modes** — grok exposes no approval configuration of its own, so `acceptEdits` and `bypassPermissions` are implemented in the runner as automatic client-side answers; agent-side ACP modes still take priority when available.
- **Session resume** — the provider ACP session id is persisted in session metadata; on restart the runner goes through `session/load` (replayed events are suppressed, so history is never duplicated) and degrades gracefully to a fresh session if the load fails. Works via daemon resume-in-place, `happy grok --resume`, `happy resume <happy-session-id>`, and the app's Resume Session action.
- **Local session discovery** — grok conversations started outside Happy show up in the app's Conversation picker (via the fork's local-session provider registry) and can be resumed from your phone.
- **Token telemetry & context window** — token usage from grok's `_meta` (input/output/cached/reasoning) flows into Happy's usage reporting, normalized so input + cache-read adds up to the real prompt size. The turn-end envelope also carries the model's real context window (500k for grok), so the app's "context left" indicator is accurate instead of assuming 190k.
- **Typewriter streaming** — assistant text streams into the app in real time through an ephemeral, end-to-end-encrypted `message-draft` channel (throttled at 250ms, broadcast-only, never persisted); the final message replaces the draft seamlessly.
- **Model switching UX** — models that require a different agent type are hidden from the picker; if a switch still fails, grok's error is surfaced as an in-session message instead of failing silently.

### Known limitations

- **Reasoning effort is not controllable from Happy** — grok 0.2.93's `agent stdio` mode ignores every knob we probed (`session/set_config_option` unimplemented, `session/set_mode` fake-accepts). Waiting on grok-side support.
- **Sequential permission execution** — grok holds all approved tools until every pending permission is answered; approved tool cards can appear to spin while another request is waiting. Grok-side behavior, not a runner bug.

### Status

- Verified end-to-end against **grok 0.2.93** with a real browser client in the local `pnpm env:up` environment; unit tests cover the permission-kind mapping, token parsing, resume fallback, and the grok agent config.
- The generic ACP fixes are designed to be upstreamable as independent PRs (permission-by-kind fix, token usage, session load/resume, grok registration), but nothing has been submitted upstream yet and this branch is intentionally not merged into the fork's `main` while the grok CLI keeps changing.
- Design & fact base: [docs/plans/grok-acp-integration.md](docs/plans/grok-acp-integration.md) (implementation plan + record) and [docs/research/grok-acp-capability-report.md](docs/research/grok-acp-capability-report.md) (wire-level capability probe).

Everything below is the upstream project.

<h3 align="center">
Step 1: Download App
</h3>

<div align="center">
<a href="https://apps.apple.com/us/app/happy-claude-code-client/id6748571505"><img width="135" height="39" alt="appstore" src="https://github.com/user-attachments/assets/45e31a11-cf6b-40a2-a083-6dc8d1f01291" /></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://play.google.com/store/apps/details?id=com.ex3ndr.happy"><img width="135" height="39" alt="googleplay" src="https://github.com/user-attachments/assets/acbba639-858f-4c74-85c7-92a4096efbf5" /></a>
</div>

<h3 align="center">
Step 2: Install CLI on your computer
</h3>

```bash
npm install -g happy
```

> Migrated from the `happy-coder` package. Thanks to [@franciscop](https://github.com/franciscop) for donating the `happy` package name!

<h3 align="center">
Step 3: Start using `happy` instead of your agent CLI
</h3>

```bash
# Instead of claude, use:
happy claude
# or
happy codex
happy gemini
happy grok           # this branch
happy agy            # Antigravity CLI
happy acp <agent>    # any ACP-speaking agent (e.g. opencode)
```

## How does it work?

On your computer, run `happy` in front of your agent command (`happy claude`, `happy codex`, …) to start the agent through our wrapper. When you want to control your coding agent from your phone, it restarts the session in remote mode. To switch back to your computer, just press any key on your keyboard.

## 🔥 Why Happy Coder?

- 📱 **Mobile access to your coding agents** - Check what your AI is building while away from your desk
- 🔔 **Push notifications** - Get alerted when your agent needs permission or encounters errors
- ⚡ **Switch devices instantly** - Take control from phone or desktop with one keypress
- 🗂️ **Start sessions remotely** - Spawn new sessions on your machine from the app, browse to the project folder, or resume a conversation you started in the terminal
- 🔐 **End-to-end encrypted** - Your code never leaves your devices unencrypted
- 🛠️ **Open source** - Audit the code yourself. No telemetry, no tracking

## 📦 Project Components

- **[Happy App](packages/happy-app)** - Web UI + mobile client (Expo)
- **[Happy CLI](packages/happy-cli)** - Command-line wrapper for Claude Code, Codex, Gemini and ACP agents
- **[Happy Agent](packages/happy-agent)** - Remote agent control CLI (create, send, monitor sessions)
- **[Happy Server](packages/happy-server)** - Backend server for encrypted sync
- **[Happy Wire](packages/happy-wire)** - Shared session protocol schemas

## 🏠 Who We Are

We're engineers scattered across Bay Area coffee shops and hacker houses, constantly checking how our AI coding agents are progressing on our pet projects during lunch breaks. Happy Coder was born from the frustration of not being able to peek at our AI coding tools building our side hustles while we're away from our keyboards. We believe the best tools come from scratching your own itch and sharing with the community.

## 📚 Documentation & Contributing

- **[Documentation Website](https://happy.engineering/docs/)** - Learn how to use Happy Coder effectively
- **[Contributing Guide](docs/CONTRIBUTING.md)** - How to contribute, PR guidelines, and development setup
- **[Edit docs at github.com/slopus/slopus.github.io](https://github.com/slopus/slopus.github.io)** - Help improve our documentation and guides

## License

MIT License - see [LICENSE](LICENSE) for details.
