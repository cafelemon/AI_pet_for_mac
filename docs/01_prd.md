# Product Requirements Document

版本：`V1.1.8`
更新时间：2026-05-31

## 1. 背景

桌宠产品如果只停留在“屏幕上播放动画”和“显示消息提醒”，长期会被素材数量、皮肤库和平台生态拉平。Desktop AI Companion 当前已经具备较强的素材管线和本地运行时基础，因此下一步要把桌宠升级为 AI/Agent companion：它可以理解外部 agent 的工作状态，选择合适动作反馈，并通过安全协议承接消息、任务、提醒和未来插件能力。

## 2. 产品目标

- 建立一个可持续迭代的本地 AI 桌宠基线。
- 保留当前透明视频资产、动作 registry、profile 管线的优势。
- 在 `V1.1.0` 开始明确接入 AI/Agent 协议层。
- 为未来 macOS 分发、苹果商店、开源平台、插件和宠物包生态预留边界。

## 3. 用户与场景

目标用户：

- 使用 Codex、OpenClaw、Claude Code、OpenCode 等工具的研发/创作者。
- 希望桌面上有一个可互动、可表达工作状态、可接收任务提醒的 AI 伙伴的用户。
- 后续希望自定义角色、导入宠物包、配置 agent 接入的高级用户。

核心场景：

- 用户在本地工作时，桌宠根据 coding/thinking/success/error/reminder/sleep 等状态展示动作。
- Codex runtime 写入状态，桌宠转换为动作和气泡。
- 用户通过控制中心切换 profile、动作和任务/提醒面板。
- 后续外部 agent 通过本地 IPC/MCP 调用 `status`、`react`、`say`、`profile.list`、`profile.select` 等能力。

## 4. 当前 V1.0.0 范围

必须保留：

- 当前 Electron + React 应用结构。
- `legacy_real` 默认 profile 可运行。
- `guofeng_ai` profile 配置和素材目录继续作为新角色方向。
- 现有动作 registry、motion catalog、source metadata、asset check。
- 任务、提醒、Codex 状态接入。
- source video 保留策略。

不在 `V1.0.0` 中强行完成：

- 真实 MCP server。
- 多 agent lease 窗口。
- App Store 打包和上架。
- 开源平台发布。
- 任意 JS 插件运行时。

## 5. V1.1.0 产品需求：AI/Agent 接入层

定位：第一个“接 AI”的版本。

目标：

- 把桌宠从文件轮询式状态展示升级为可被 agent 调用的本地 companion 协议。
- 保持 Electron 单应用和现有 registry，不做过早 monorepo 拆分。
- 先做安全、短消息、低权限、可测试的协议底座。

能力草案：

- `companion.status()`：返回 app version、active profile、current action/state、asset readiness。
- `companion.react({ reaction, ttlMs })`：将 agent reaction 映射为本地 action id。
- `companion.say({ message, reaction? })`：经过安全校验和节流后显示短气泡。
- `companion.profile.list()`：列出 profile 和 readiness。
- `companion.profile.select({ profileId })`：切换 profile。

安全要求：

- 气泡消息默认短文本。
- 拒绝密钥、路径、URL、代码块、日志堆栈、完整工具输出。
- 所有外部入口必须有本地边界、token 或等效授权机制。
- 外部 agent 不直接写内部 runtime 文件，统一走协议层。

## 6. V1.1.4 产品需求：MCP 能力蓝图

定位：不新增 runtime 方法的规划版本。

目标：

- 把现有 MCP 能力从“安全遥控”规划到“agent 状态与确认流”。
- 明确 L1-L5 能力分层：基础调用、agent 状态、用户确认、事件/上下文、companion kernel。
- 避免把桌宠做成普通消息窗口，后续能力应围绕状态、确认、上下文和动作表达。

验收：

- 有独立 MCP capability blueprint 文档。
- 不改变当前 `V1.1.3` package/runtime 版本。
- 不把尚未实现的候选方法写成当前可调用能力。

## 7. V1.1.5 产品需求：MCP Agent 状态面板

定位：MCP L2 能力实施版本。

目标：

- 让外部 agent 不只发送短消息，而能表达当前工作状态。
- 提供 `working / testing / waiting_auth / blocked / done / idle` 语义状态。
- 保持现有 `status/react/say/profile.*` 兼容。

能力：

- `companion.agent.set_state({ status, message?, ttlMs? })`
- `companion.agent.get_state()`
- `companion.agent.clear_state()`

验收：

- 状态面板能力通过 MCP adapter 暴露为工具。
- message 复用现有安全校验。
- clear 不受 cooldown 限制，避免状态卡住。

## 8. V1.1.6 产品需求：MCP 用户确认流

定位：MCP L3 最小闭环。

目标：

- 让 agent 的授权/确认请求进入本地用户确认流程。
- 控制中心展示 pending confirmation 和 `允许 / 拒绝 / 取消` 操作。
- 避免外部 agent 自己伪造用户授权结果。
- 控制中心确认卡片是 `V1.1.6` 的临时承接方案；后续补齐确认/授权相关动作与气泡交互后，用户确认入口应迁移到专门的桌宠气泡 UI。

能力：

- `companion.confirm.request({ title, message, ttlMs? })`
- `companion.confirm.get()`
- `companion.confirm.cancel()`

验收：

- pending request 自动触发 `waiting_auth` 状态。
- title/message 复用安全校验。
- 用户响应只通过 renderer IPC 写入。

## 9. V1.1.7 产品需求：上下文摘要与视频台账

定位：MCP L4 最小只读能力和素材供给治理补丁。

目标：

- 让外部 agent 能读取安全的 companion 上下文摘要，而不是持续拼接 `status`。
- 提供最近活动记录，帮助 agent 理解刚刚发生的 `say/react/agent/confirm/profile` 变化。
- 把视频供给进度独立成台账，避免缺素材阻塞代码层迭代。

能力：

- `companion.context.summary()`
- `companion.activity.list({ limit? })`
- `docs/10_video_supply_progress.md`

验收：

- 摘要不暴露 token、socket path、discovery path、绝对路径或长日志。
- 活动记录只保存在内存 ring buffer，不落盘。
- `V1.2.0` click/drag 缺素材仍保持待补。

## 10. V1.1.8 产品需求：Profile Capability Manifest

定位：MCP L5 最小 profile 能力声明，不进入完整插件/权限系统。

目标：

- 让外部 agent 能知道当前 profile 支持哪些状态、交互、确认入口和 MCP 层级。
- 将缺 source 的视频动作以机器可读方式暴露，但不把空素材标记为 ready。
- 为 App Store、开源平台和 profile package 预留 license/provenance/publishable 字段。
- 在文档中明确 L4 `companion.events.subscribe` 尚未实现，避免误当成已完成能力。

能力：

- `companion.profile.capabilities({ profileId? })`
- MCP tool：`companion_profile_capabilities`
- `companion.context.summary()` 增加精简的 `profileCapabilitiesSummary`

验收：

- 返回内容不暴露 token、socket path、discovery path、绝对素材路径或本地 cwd。
- `guofeng_ai` 显示鼠标害羞链路和 `drag_hold_lift` 已 ready，四个 click/drag P0 动作缺 source。
- `legacy_real` 使用保守声明，不继承 `guofeng_ai` 的交互能力。

## 11. 未来预留

苹果商店/桌面分发预留：

- 避免依赖不可解释的私有 API。
- 权限、辅助功能、自动启动、通知、文件访问、网络访问要在架构上可声明、可关闭。
- 后续需要签名、公证、自动更新、崩溃日志和隐私说明。
- 素材体积要可拆分，避免主包过大。

开源平台预留：

- 核心 runtime、协议、MCP/server/client、schema 和示例 profile 可以开源。
- 商业或版权不明确的素材、生成源视频、模型中间文件应与核心代码分离。
- 每个 profile/package 需要 license manifest、source provenance 和可发布状态。
- 插件系统先声明式、受限能力，再考虑脚本运行时。

## 12. 成功标准

`V1.0.0` 成功标准：

- 根版本号为 `1.0.0`。
- 文档清楚描述当前冻结状态、版本规则、AI 方向和验收方式。
- 当前动作与 profile 资料可以被后续 agent 快速理解。

`V1.1.0` 成功标准：

- 有本地 agent 协议入口。
- 有 message validator 和节流。
- 有协议 contract tests。
- Codex/MCP 至少有一个可演示调用链路。
- 控制中心可查看 AI/Agent 接入状态。
