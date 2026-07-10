# Grok (Grok Build CLI) ACP 接入 — 完整实现计划

> 目标：让 Happy 像支持 Gemini/OpenCode 一样一等支持 `grok` CLI（xAI Grok Build），
> 通过既有的通用 ACP runner 接入，并顺手修复探测中发现的通用 ACP 缺陷。
> 事实依据：`docs/research/grok-acp-capability-report.md`（2026-07-09 wire 级探测，
> Grok 0.2.93），实现前先通读该报告。本计划面向上游（slopus/happy）贡献：
> 改动要按可独立评审的 PR 拆分。无时间进度，按里程碑顺序执行。

---

## 1. 范围与既定决策

### 1.1 必须实现
1. `grok` 注册为 known ACP agent，`happy grok` / `happy acp grok` 可用。
2. ACP 权限选项按 `PermissionOption.kind` 匹配（通用修复，纠正现有按 Codex/Gemini 特定 id 匹配的缺陷——对 Grok 的 reject 路径当前会回错误的 `cancel` id）。
3. Grok 的 token 用量（`_meta.totalTokens/inputTokens/outputTokens/cachedReadTokens/reasoningTokens`）进入 Happy 的 token 遥测。
4. ACP session 恢复：持久化 provider ACP sessionId，重连时走 `session/load`（Grok `loadSession: true` 已验证）。
5. app 端 flavor/品牌呈现 + 机器 CLI 检测含 grok。

### 1.2 明确不做（首版）
- 把 Grok 私有 `_meta["x.ai/sessionConfig"]` 的 high/medium/low 映射成 ACP modes 或沙箱档位（它们是 reasoning effort，不是审批模式；可作为注解性显示，后续增强）。
- 跨 agentType 的模型热切换（Grok 侧硬性 `MODEL_SWITCH_INCOMPATIBLE_AGENT`，产品上只做清晰报错/禁用注解，不做"自动开新会话"）。
- `happy grok model set` 之类的配置管理子命令（对齐 gemini 的这类便利命令可后续补）。

### 1.3 既定决策（不要重开讨论）
- 走**通用 ACP runner**（`packages/happy-cli/src/agent/acp/`），不为 Grok 单开 backend。Grok 特有行为以 provider 注解/fallback 方式处理，不污染标准路径。
- **launch argv 顺序**：`grok --no-auto-update agent stdio`。注意 `grok agent stdio --no-auto-update` 会被 0.2.93 拒绝（报告 §Environment 有 log 证据）。
- 权限映射修复、token usage、session/load 都是**通用 ACP 能力**，实现时优先读标准字段（如标准 `usage_update`、`configOptions`），Grok `_meta` 只作 fallback——这样 PR 对上游和其他 ACP agent 都有价值。
- 面向上游贡献：commit 拆分成可独立评审的单元（见 §6），遵守 happy-cli CLAUDE.md 代码规范（严格类型、真实调用测试等）。

## 2. 现状基线（关键文件）

- `packages/happy-cli/src/agent/acp/acpAgentConfig.ts`：`KNOWN_ACP_AGENTS` 目前只有 gemini/opencode；有 `--` 透传逃生门。
- `packages/happy-cli/src/agent/acp/runAcp.ts`：`resolveSessionFlavor()` 返回 `'gemini' | 'opencode' | 'acp'`；模型选择器从 `configOptions` → legacy `models` 提取。
- `packages/happy-cli/src/agent/acp/AcpBackend.ts`：`requestPermission` 按 `proceed_once`/`proceed_always`/`cancel` 等 id 匹配（Grok 用 `allow-once`/`allow-edits-session`/`reject-once`）；`sendPrompt()` 丢弃 `PromptResponse`（token 数据流失）；`startSession()` 永远新建 session（无 resume 路径）。
- `packages/happy-cli/src/utils/detectCLI.ts`：机器侧 CLI 可用性上报，含 claude/codex/gemini/openclaw，无 grok。
- `packages/happy-cli/src/index.ts`：`happy gemini` 有专属 subcommand 处理；grok 的入口对齐这个模式（至少 `happy grok` 直达 ACP 会话）。
- app 端：`packages/happy-app/sources/sync/typesRaw.ts`（flavor schema）、`machine/[id].tsx`（机器 CLI 状态显示）、`text/_default.ts` + `translations/*`（文案）、新建会话页的 agent 过滤逻辑（实现时从 detectCLI 消费点反查）。
- 本机 grok：`/home/dev/.grok/bin/grok`，v0.2.93，已登录（探测时 `grok -p` preflight 通过）。
- E2E 环境：monorepo 自带 `pnpm env:up --template authenticated-empty` / `env:cli` / `env:web`（`environments/`），解决报告 gap #13"本机无 Happy 凭据导致端到端未验证"的问题。

## 3. 探测结论速览（详见报告 Conclusion Matrix）

能力齐备：initialize/new/prompt、thinking 流、工具卡（read/shell/edit 含 diff/locations/rawInput）、审批与拒绝、cancel/中断后进程存活、`session/load` 跨进程恢复、slash commands、`_meta` token 数据。
四个 gap（全部是 Happy runner 侧工作）：① resume 路径缺失；② 权限选项 id 不匹配（reject 会答非所问）；③ 模型切换跨 agentType 报错；④ token `_meta` 未被消费。

## 4. 实现设计

### 4.1 权限映射修复（通用，最高优先级）
`AcpBackend.requestPermission`：选项匹配顺序改为 **`kind` 优先**（`allow_once` / `allow_always` / `reject_once` / `reject_always`）→ 现有 id/name 匹配作为 fallback → 最后才是"取第一个"兜底。Happy 的决策语义映射：approve→`allow_once`，approve-for-session→`allow_always`，deny→`reject_once`。带单测覆盖 Grok 选项集（`allow-once`/`allow-edits-session`/`reject-once`）与既有 Codex/Gemini 选项集不回归。

### 4.2 Grok 注册与 flavor
- `KNOWN_ACP_AGENTS` 增加 `grok: { command: 'grok', args: ['--no-auto-update', 'agent', 'stdio'] }`。
- `resolveSessionFlavor` 增加 `'grok'`；app 端 flavor schema、品牌图标、名称文案同步（翻译文件全语言补 key，参照 gemini 的条目复制改写）。
- `detectCLI.ts` 增加 grok 命令检测，机器页显示。
- `happy grok` 入口：直达 ACP 会话（等价 `happy acp grok`），透传其余参数。

### 4.3 Token 遥测
- `sendPrompt()` 保留 `PromptResponse`，解析标准 `usage` 字段（如有）→ fallback 解析 `_meta` 的 token 字段；`session/update` 的 `params._meta.totalTokens` 同理。
- 映射进 Happy 现有 token-count 事件/会话元数据（实现时对齐 claude/codex 已有的 token 上报格式）。
- 模型上下文窗口 `_meta.totalContextTokens` 一并纳入（供 app 端上下文余量显示，如现有 UI 支持）。

### 4.4 Session 恢复
- 新建 ACP session 成功后，把 provider sessionId 写入 Happy session metadata。
- runner 启动时若 metadata 带 provider sessionId 且 agent `loadSession: true`：走 `session/load`，回放事件与 Happy 侧历史**去重合并**（Happy 已有完整历史，回放事件不重复入库，只用于恢复 runner 内部状态）。
- `session/load` 失败（会话过期/不存在）时降级为新建 session，不阻塞。

### 4.5 模型切换 UX
- 模型列表照常从 legacy `models` 提取展示。
- `session/set_model` 失败时把错误信息透传给客户端（toast/消息），不静默。
- 可选注解：`availableModels[]._meta.agentType` 与当前不同的模型标注"需新会话"（实现成本低就做，高就只留报错透传）。

### 4.6 Grok 私有 `_meta` 处理原则
`x.ai/sessionConfig`（high/medium/low reasoning effort）与 `x.ai/tool` 等仅作为注解性信息保留/转发，不映射为标准 modes/configOptions；UI 不把它们当沙箱/审批档位展示。

## 5. 里程碑与验收

### M0 环境与事实复核
- `pnpm env:up` 起本地开发环境，取得 Happy 凭据；确认本机 grok 可登录状态。
- 复跑一次关键探测断言（argv 顺序、权限选项 id、loadSession），确认 grok 版本行为与报告一致；如 grok 已升级且行为变化，先修订本计划再动手。
- ✅ 验收：`happy acp -- grok --no-auto-update agent stdio` 在本地环境跑通一轮完整会话（报告 gap #13 销项）。

### M1 核心接入（对应 §4.1、§4.2）
- ✅ 验收：`happy grok` 启动会话；网页端看到 grok flavor 品牌；发消息收到流式回复与 thinking；shell/edit 工具卡带 diff 正常渲染；**approve、approve-for-session、deny 三种审批决策在 Grok 侧行为正确**（deny 必须真拒绝——当前 bug 的回归点）；机器页显示 grok installed；gemini/opencode 会话不回归。

### M2 四个 gap 补齐（对应 §4.3、§4.4、§4.5）
- ✅ 验收：会话中 token 计数/上下文用量在 app 端可见且与 `_meta` 数值一致；杀掉 CLI 进程重启后会话经 `session/load` 恢复、追问能引用恢复前上下文、历史不重复；切换到不兼容模型收到明确报错提示（不静默失败）。

### M3 测试、打磨与上游 PR
- Vitest：权限 kind 映射、token 解析、resume 降级路径、`resolveAcpAgentConfig` grok 条目。
- 文档：README/docs 增加 grok 使用说明；本计划随实现事实更新。
- 按 §6 拆 PR 提交上游，跟进 review。
- ✅ 验收：全部单测过；typecheck 过；PR 提交且自查通过 upstream CONTRIBUTING 要求。

## 6. 上游 PR 拆分（每个可独立合并）

1. **fix(cli): ACP permission option selection by kind** —— 纯 bug fix，不提 grok 也成立，最容易先合。
2. **feat(cli): ACP token usage from PromptResponse/update `_meta`** —— 通用增强。
3. **feat(cli): ACP session load/resume** —— 通用增强（Grok/未来支持 loadSession 的 agent 受益）。
4. **feat: add Grok as known ACP agent**（CLI 注册 + flavor + detectCLI + app 品牌/翻译）—— 依赖 1–3 合入体验才完整，但代码上可独立。

## 7. 实现记录（2026-07-10，实现时随事实更新）

M0–M3 已按计划完成，全部验收在本地 `pnpm env:up` 环境用真实 grok 0.2.93 + 真实浏览器端到端验证。与原计划的差异与新发现：

1. **app 端权限决策缺口（计划未覆盖，已修复）**：`PermissionFooter` 对非 Codex 会话渲染 Claude 风格按钮，"approve-for-session" 发送的是 Claude `allowedTools` 模式（ACP runner 完全不消费），CLI 侧永远收不到 `approved_for_session`。已改为 gemini/grok/opencode/acp flavor 走 Codex 同款"决策式"按钮（approve / approve_for_session / abort）。这是权限修复 PR 的 app 侧配套。
2. **工具卡通用修复（计划外顺手修）**：grok 的初始 `tool_call` 无 `kind`、参数在标准 `rawInput` 里，通用 handler 渲染成 "unknown/{}"。已改为 kind → title 兜底、合并 `rawInput` 进 args。
3. **token 进 app 的通道**：会话协议 turn-end envelope 新增可选 `usage` 字段（happy-wire + app 双侧 schema），reducer 在 ready 事件处消费。`usage-report`（服务器记账）沿用 claude 通道，key 为 `<agent>-session`、cost 置零（Happy 无 ACP 定价表）。归一化：`input_tokens` 减去 `cachedReadTokens`（grok 的 inputTokens 含缓存），使 input+cache_read+cache_creation 等于真实 prompt 规模。
4. **resume 行为实测**：daemon resume-in-place（HAPPY_RECONNECT_*）+ `happy grok --resume <acpSessionId>` 已通；`session/load` 回放事件在 backend 内抑制（`suppressReplayUpdates`），历史不重复；load 失败降级新会话并向客户端发提示消息。`happy resume <happy-session-id>` / app 端 Resume Session 快捷操作（实验开关 `expResumeSession`）均支持 grok。
5. **grok 权限管线观察**：grok 会在前一工具权限批准后立刻发起下一工具的权限请求，且**所有待决权限都答复前不执行任何已批准的工具**——UI 上表现为批准后工具卡仍在转圈，属 grok 侧行为，非 runner bug。
6. **上下文窗口显示**：app 端 `MAX_CONTEXT_SIZE` 硬编码 190000，grok 的 `_meta.totalContextTokens`（500k）暂未消费——"93% left" 指示基于 190k 计算。按计划 §4.3"如现有 UI 支持"处理，留作后续增强。
7. **模型切换**：`session/set_model` 失败信息已透传为会话内消息（实测 Composer 2.5 切换收到 grok 的 MODEL_SWITCH_INCOMPATIBLE_AGENT 原文）；未做 `_meta.agentType` 注解（§4.5 的可选项，成本收益不划算，报错透传已满足验收）。
8. **gemini/opencode 回归**：本机未安装这两个 CLI，端到端回归以单测覆盖（kind 优先 + id/name fallback 三家选项集），`happy gemini` 主路径走独立 runGemini backend 不受影响。

## 8. 风险

| 风险 | 应对 |
|---|---|
| grok CLI 版本快速迭代（0.2.x），argv/协议行为漂移 | M0 复核步骤兜底；known config 保守（`--no-auto-update`）；`--` 透传逃生门始终可用 |
| session/load 回放与 Happy 历史合并出重复消息 | 回放事件只恢复 runner 状态不入库；M2 验收明确检查不重复 |
| 权限映射改动影响既有 gemini/opencode/codex 用户 | kind 优先但保留 id fallback；单测覆盖三家选项集 |
| 上游对 app 端品牌资产（图标）有格式要求 | 参照 gemini/opencode 资产的既有格式与位置，PR 前对照 CONTRIBUTING |
