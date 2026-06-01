# Decision Log

更新时间：2026-05-31

## D001：冻结当前状态为 V1.0.0

决定：

当前 Desktop AI Companion 状态冻结为 `V1.0.0`，npm/package 版本同步为 `1.0.0`。

原因：

- 当前本地 runtime、动作 registry、profile 配置、任务/提醒、Codex 状态和素材校验已经形成可继续迭代的基线。
- 后续需要用明确版本语义管理功能迭代。

影响：

- 后续功能按 `MAJOR.MINOR.PATCH` 记录。
- 当前 runtime assets 和 source videos 按锁定基线处理。

## D002：长期差异化不是素材数量，而是 AI/Agent 内核

决定：

当前阶段可以承认素材质量和动作管线是明显优势，但未来产品定位要转向 AI/Agent companion kernel。

原因：

- 单纯素材数量容易被平台型竞品追平。
- 真正差异化来自桌宠能否成为 agent 状态、任务、上下文和用户节奏的本地表达层。
- 用户明确要求未来方向类似 OpenClaw 内核，而不是消息喇叭。

影响：

- `V1.1.0` 必须优先规划 AI/Agent 接入层。
- 文档中不再把“资产更多”写成长期核心壁垒。

## D003：短期不照搬 OpenPets monorepo

决定：

短期保持单 Electron app + Python asset scripts + profile config 结构。

原因：

- 当前项目最重的是素材处理、动作注册和本地运行时。
- MCP/client/CLI 尚未稳定，过早拆包会增加维护成本。

影响：

- 先实现协议 contract 和本地入口。
- 等 AI/Agent 接口稳定后，再评估 packages/client、packages/mcp、profile package 等拆分。

## D004：外部 agent 不直接写内部 runtime/config

决定：

外部 agent 未来统一通过 companion protocol 调用能力，不直接写 runtime state 或内部 config。

原因：

- 文件直写难以管理权限、安全、节流和兼容。
- protocol 层更适合 MCP、多 agent 和未来插件。

影响：

- `V1.1.0` 要设计 `status`、`react`、`say`、`profile.list` 等方法。
- 需要 message validator 和 contract tests。

## D005：气泡消息必须安全过滤

决定：

AI/Agent 接入后的 `say` 类能力必须经过安全校验和 cooldown。

原因：

- 桌宠气泡是桌面可见 UI，不应显示密钥、路径、URL、代码、日志堆栈或完整工具输出。

影响：

- `V1.1.0` 的验收包含 message validator。
- 控制中心可显示接入状态，但不直接暴露敏感内容。

## D006：为 App Store 与开源预留，但现在不进入发布工程

决定：

当前只做架构预留，不立即执行苹果商店上架或开源发布。

原因：

- 当前重点是产品基线和 AI/Agent 接入。
- 分发和开源需要素材版权、权限、隐私、签名、公证、包体和 license manifest 系统化准备。

影响：

- 新增 profile/package 时记录 license/provenance。
- 核心 runtime 与素材资产保持可拆分。
- 避免引入难以解释的权限和私有 API 依赖。

## D007：V1.1.0 使用本地 Unix socket + stdio MCP adapter

决定：

`V1.1.0` 采用本地 Unix socket 作为 companion protocol 的第一层入口，并提供 stdio MCP adapter 转发到本地 socket。

原因：

- 可以保留当前 Electron 单应用结构，不急于拆 monorepo。
- 本地 socket + discovery token 足够支撑最小 agent 调用链路。
- stdio MCP adapter 更容易被 Codex、Claude/OpenCode 类工具接入。

影响：

- Electron main 负责生成 discovery、token 和本地 socket。
- MCP adapter 不保存 token，只读取 discovery 后转发调用。
- 不做远程 HTTP/公网服务。

## D008：Agent 状态层并行于 Codex 文件状态链路

决定：

新增 `agent` runtime state，不替换现有 Codex 文件轮询状态。

原因：

- 避免破坏 `V1.0.0` 已验证的 Codex hook 链路。
- 为未来多 agent/project session 保留演进空间。

影响：

- Renderer 中 reminder/task 仍优先，agent 高于 Codex。
- `waiting` reaction 暂映射到 `reminder`，直到有独立 waiting 可渲染素材。

## D009：Codex MCP 实机联调作为 V1.1.0 闭环验收

决定：

`V1.1.0` 的最小闭环验收以 Codex MCP 真实调用为准，而不只停留在本地 contract check。

原因：

- 项目目标是让桌宠成为可被 agent 调用的 companion kernel。
- stdio MCP adapter 必须能被 Codex 注册、发现并调用，才算完成第一阶段 AI/Agent 接入。
- contract check 只能验证协议形状，不能替代真实 MCP 客户端到 renderer 的端到端链路。

影响：

- `companion_status`、`companion_say`、`companion_react` 作为首批真实联调 smoke cases。
- 后续 `V1.1.x` 的协议改动需要同时考虑 contract check 和 Codex MCP 实机回归。
- cooldown、message validator、profile readiness 这类安全策略应在真实 MCP 调用中保持可观察、可解释。

## D010：V1.2.0 只对 guofeng_ai 启用用户交互

决定：

`V1.2.0` 的用户交互动作只覆盖 `guofeng_ai` profile，`legacy_real` 保持现状。

原因：

- 当前下一阶段产品形象和 AI 角色方向集中在 `guofeng_ai`。
- `legacy_real` 没有本轮高质量 P1-A source videos，强行启用会扩大素材和回归范围。
- profile-scoped interaction rules 能验证未来多 profile 的能力边界。

影响：

- `guofeng_ai` 使用独立 `interaction_rules.config.json`。
- `legacy_real` 继续使用禁用状态的默认 interaction rules。
- P1-A source/WebM/keyframe/QA 未到位前，不把缺素材动作标记为 runtime ready。

## D011：V1.1.2 先落地鼠标靠近害羞循环

决定：

`V1.1.2` 作为小版本补丁，先将 `guofeng_ai` 的鼠标靠近/移开反馈从“方向预判看向鼠标”改为“靠近害羞循环”。

原因：

- 鼠标方向无法稳定预判，靠近害羞更符合当前素材和交互感知。
- 用户已提供三条可用源视频，可以先形成完整 hover 闭环。
- click/drag 素材仍未齐，不应阻塞 hover 体验。

影响：

- 新增 `mouse_shy_loop` runtime action。
- `mouse_hover_look -> mouse_shy_loop -> mouse_leave_back` 成为当前鼠标靠近链路。
- click/drag 继续留在 V1.2.0 后续工作。

## D012：V1.1.3 只加速鼠标害羞 runtime 产物

决定：

`V1.1.3` 作为小版本补丁，只调整 `V1.1.2` 三段鼠标害羞动作的 runtime 播放速度，不覆盖原始 source mp4。

原因：

- 三段源视频均约 5 秒，直接用于鼠标反馈显得拖沓。
- 用户指定两个衔接态使用 `1.75x`，循环态使用 `1.5x`。
- 保留原始素材有利于后续重新抠像、重新对齐或重新调速。

影响：

- `motion_sources.config.json` 使用 `speedFactor` 记录动作节奏。
- 视频管线在透明 WebM 输出阶段应用 `setpts=PTS/<speedFactor>,fps=24`。
- `states.config.json` 的三段 runtime 时长跟随加速后 WebM 更新。

## D013：V1.1.4 先做 MCP 能力蓝图，不改协议实现

决定：

`V1.1.4` 只沉淀 MCP/Agent 能力蓝图，当前运行版本继续保持 `V1.1.3`，不新增 runtime 方法。

原因：

- 视频 AI 额度未刷新前，不应为了 click/drag 缺素材阻塞下一环。
- 当前 MCP 已完成 L1 遥控能力，但需要先明确 L2-L5 的产品边界和安全口径。
- 先做蓝图可以避免后续盲目增加 `say` 类工具，把桌宠做成普通消息喇叭。

影响：

- 新增 `docs/09_mcp_capability_blueprint.md`。
- 后续 MCP 实施优先从 agent 状态面板开始，再做确认流、事件与 companion kernel。
- 新增 MCP 方法前必须同步 local protocol、stdio adapter、contract check 和 Codex MCP 实机 smoke test。
- click/drag 缺素材动作继续留在 `V1.2.0`，不得标记 runtime ready。

## D014：V1.1.5 先实现 MCP Agent 状态面板

决定：

`V1.1.5` 实施 L2 agent 状态面板，新增 `companion.agent.set_state/get_state/clear_state`，但不进入 L3 用户确认流。

原因：

- 当前已有 agent runtime 层和 renderer 优先级，扩展成本低。
- 语义状态比单纯 `say/react` 更接近 companion kernel 方向。
- 状态面板不依赖新视频素材，可以在视频额度刷新前推进产品差异化。

影响：

- stdio MCP adapter 新增三项 agent state tools。
- `AgentRenderState` 包含 semantic status，控制中心可观察。
- `protocolVersion` 保持 `1`，通过 discovery methods 暴露新增向后兼容能力。
- 后续 L3 确认流应基于当前 agent state 层继续扩展。

## D015：V1.1.6 使用控制中心承接用户确认

决定：

`V1.1.6` 实施 L3 用户确认流，新增 `companion.confirm.request/get/cancel`，用户响应只通过控制中心 renderer IPC 完成。

原因：

- `V1.1.5` 已有 `waiting_auth` agent 状态，确认流可以复用该表达层。
- 控制中心已有 `AI 接入` 面板，第一版比桌宠气泡按钮更稳；这是临时承接方案，不代表最终交互形态。
- MCP 不应拥有写入用户授权结果的 respond 方法，避免外部 agent 伪造确认。

影响：

- stdio MCP adapter 新增三项 confirmation tools。
- 第一版只允许单个 pending confirmation。
- pending confirmation 自动打开控制中心并展示 `允许 / 拒绝 / 取消`。
- 后续补齐确认/授权动作和气泡组件后，主确认入口应迁移到桌宠气泡；控制中心保留状态观察和兜底。
- 多选项或表单式确认仍需要单独规划。

## D016：V1.1.7 不等视频，先做视频台账与只读上下文

决定：

`V1.1.7` 新增 `docs/10_video_supply_progress.md`，并实施 `companion.context.summary`、`companion.activity.list` 两个 L4 最小只读能力。

原因：

- 视频 AI 额度和 source video 供给不应阻塞协议层和 companion kernel 方向。
- 自动 action progress 适合机器校验，但用户需要一份人工可读的“缺什么/已有啥/下一批给什么”台账。
- 上下文摘要和活动记录能让 agent 少轮询、少拼接状态，也不依赖新素材。

影响：

- `V1.2.0` click/drag 缺素材继续保持待补，不标记 runtime ready。
- 活动记录只保存在 Electron main 内存 ring buffer，不落盘、不跨重启。
- `context.summary` 必须避免 token、socket path、discovery path、绝对路径和长日志。
- 后续如需实时事件订阅，单独进入 `companion.events.subscribe` 设计。

## D017：V1.1.8 先做 Profile 能力声明，不等完整 Kernel

决定：

`V1.1.8` 新增 profile manifest，并通过 `companion.profile.capabilities` / `companion_profile_capabilities` 暴露给本地 agent。

原因：

- 视频素材缺口不应阻塞代码层 companion kernel 的推进。
- Agent 需要机器可读地知道 profile 能做什么、缺什么、哪些能力只是临时入口。
- `legacy_real` 和 `guofeng_ai` 的能力边界不同，不能只靠 action registry 推断。
- App Store 和开源预留需要提前记录 license/provenance/publishable 口径。

影响：

- `pet_profiles.config.json` 增加 `profileManifestPath`。
- `context.summary` 增加精简 `profileCapabilitiesSummary`。
- 返回内容不得包含 token、socket path、discovery path、绝对素材路径或本地 cwd。
- `companion.events.subscribe` 仍未实现，作为 L4 后续 TODO 单独保留。
