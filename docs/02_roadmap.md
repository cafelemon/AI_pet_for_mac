# Roadmap

更新时间：2026-05-31
当前版本：`V1.4.0`

## 版本节奏

版本号采用 `MAJOR.MINOR.PATCH`：

- `MAJOR`：大版本，代表产品形态或核心差异化发生明显变化。
- `MINOR`：新增或修改一个板块、功能点、profile、协议层或主要工作流。
- `PATCH`：bug fix、小体验优化、文档修订、配置补漏、素材小修。

## V1.0.0：当前基线冻结

定位：本地高质量桌宠运行时基线。

已纳入：

- Electron + React 本地应用。
- `legacy_real` 默认 profile。
- `guofeng_ai` profile 框架和部分素材。
- 动作 registry、motion catalog、source metadata、asset check。
- 控制中心、任务、提醒、Codex runtime 状态。
- 文档整合与版本命名规范。

验收：

- `npm run typecheck`
- `npm run build`
- `python3 scripts/asset_check.py --strict --webm-strict`
- `python3 scripts/pb2_video_pipeline.py check --skip-missing`
- `npm run motion:progress`

## V1.1.0：AI/Agent 接入层

定位：第一个明确“接 AI”的版本。当前已进入实现态。

目标：

- 建立本地 companion IPC/discovery 协议。
- 设计 MCP server 最小接口。
- 让桌宠被 agent 安全调用，而不是只显示状态文件。

交付物：

- 本地 discovery 文件：`~/.desktop-ai-companion/discovery/companion.json`。
- 本地 Unix socket：`~/.desktop-ai-companion/ipc/companion.sock`。
- `companion.status`、`companion.react`、`companion.say`、`companion.profile.list`、`companion.profile.select`。
- reaction 到 action id 的映射表。
- message validator 与 cooldown。
- `npm run agent:contract` 协议检查。
- 控制中心新增 `AI 接入` 状态区域。
- stdio MCP adapter：`node scripts/companion_mcp_server.mjs`。
- Codex MCP 实机联调通过：`companion_status`、`companion_say`、`companion_react` 已验证。

验收状态：

- 已通过最小闭环：Codex MCP -> stdio adapter -> local socket -> Electron main -> renderer reaction/message。
- 已验证 `success` 消息气泡、`thinking` reaction 和 cooldown 策略。
- 后续 `V1.1.x` 可继续补充敏感消息拒绝、profile 切换和更多 MCP 客户端兼容性回归。

## V1.1.2：鼠标靠近害羞循环

定位：小版本补丁，只处理 `guofeng_ai` 鼠标靠近/移开反馈，不进入完整 V1.2 click/drag。

交付物：

- `mouse_hover_look`：正常到害羞。
- `mouse_shy_loop`：鼠标停留害羞循环。
- `mouse_leave_back`：害羞到正常。

验收状态：

- 三条 source video 已接入并转为透明 WebM。
- 三条动作均以冻结 `idle` 人物大小对齐。
- 多底色 QA 已生成，用于检查头脚完整、发丝袖口和水印/光标区域。
- package 版本升到 `1.1.2`。

## V1.1.3：鼠标害羞节奏加速

定位：小版本补丁，只调整 `V1.1.2` 鼠标害羞交互节奏，不改变素材来源和交互语义。

交付物：

- `mouse_hover_look` 输出阶段使用 `1.75x`。
- `mouse_shy_loop` 输出阶段使用 `1.5x`。
- `mouse_leave_back` 输出阶段使用 `1.75x`。

验收状态：

- 三条动作重新生成透明 WebM、keyframe 和多底色 QA。
- runtime 时长更新为加速后的 `2875ms / 3375ms / 2875ms`。
- package 版本升到 `1.1.3`。

## V1.1.4：MCP 能力蓝图

定位：规划态补丁，不改变当前运行版本号，不新增 runtime 方法。

目标：

- 明确当前 MCP L1 能力已完成：`status / react / say / profile.list / profile.select`。
- 规划 L2 agent 状态面板、L3 用户确认流、L4 事件与上下文摘要、L5 companion kernel。
- 记录未来新增 MCP 方法的安全边界、验收口径和实施门槛。

交付物：

- `docs/09_mcp_capability_blueprint.md`
- roadmap、progress、decisions 和 agent guide 中记录 `V1.1.4` 蓝图边界。

不做：

- 不生成新视频。
- 不把 click/drag placeholder 标记为 runtime ready。
- 不新增远程 HTTP 服务或新 MCP SDK 依赖。
- 不改变现有 Codex MCP 已验证链路。

## V1.1.5：MCP Agent 状态面板

定位：MCP L2 能力实施版本，向后兼容扩展现有 protocol methods。

交付物：

- 新增 `companion.agent.set_state`、`companion.agent.get_state`、`companion.agent.clear_state`。
- 新增 MCP tools：`companion_agent_set_state`、`companion_agent_get_state`、`companion_agent_clear_state`。
- 支持 `working / testing / waiting_auth / blocked / done / idle` 语义状态。
- 控制中心 AI 接入面板显示 semantic status、runtime state 和 expiresAt。

验收状态：

- `protocolVersion` 保持 `1`，通过 discovery methods 暴露新增能力。
- `message` 复用现有安全 validator。
- `clear_state` 不受 cooldown 限制，避免 agent 状态卡住。
- package 版本升到 `1.1.5`。

## V1.1.6：MCP 用户确认流

定位：MCP L3 最小闭环，让 agent 的授权/确认请求进入本地用户确认流程。

交付物：

- 新增 `companion.confirm.request`、`companion.confirm.get`、`companion.confirm.cancel`。
- 新增 MCP tools：`companion_confirm_request`、`companion_confirm_get`、`companion_confirm_cancel`。
- 控制中心 `AI 接入` 面板显示确认卡片和 `允许 / 拒绝 / 取消` 操作。
- pending confirmation 自动打开控制中心并让桌宠进入 `waiting_auth`。
- 当前控制中心确认卡片是临时 UI；后续补齐专门确认动作和气泡后，确认交互应迁移到桌宠气泡层。

验收状态：

- 第一版只支持单个 pending confirmation。
- 用户响应只通过 renderer IPC 完成，MCP 不暴露伪造同意的 respond 方法。
- package 版本升到 `1.1.6`。

## V1.1.7：视频供给台账 + MCP 上下文摘要

定位：MCP L4 最小只读能力实施版本，同时把视频素材供给从代码主线中解耦。

交付物：

- 新增 `docs/10_video_supply_progress.md` 人工视频供给台账。
- 新增 `companion.context.summary` 和 `companion.activity.list`。
- 新增 MCP tools：`companion_context_summary`、`companion_activity_list`。
- 活动记录使用 Electron main 内存 ring buffer，不落盘、不跨重启保留。

验收状态：

- `context.summary` 不暴露 token、socket path、discovery path、绝对路径或长日志。
- `activity.list` 默认返回最近 20 条，最大 50 条。
- `protocolVersion` 保持 `1`，通过 discovery methods 暴露新增能力。
- package 版本升到 `1.1.7`。

## V1.1.8：Profile Capability Manifest

定位：MCP L5 最小 profile 能力声明版本，让外部 agent 可以读取 profile 的能力边界、缺视频动作和分发预留口径。

交付物：

- `data/profiles/<profile>/profile_manifest.config.json`
- `pet_profiles.config.json` 挂载 `profileManifestPath`
- 新增 `companion.profile.capabilities`
- 新增 MCP tool：`companion_profile_capabilities`
- `context.summary` 增加 `profileCapabilitiesSummary`

验收状态：

- `guofeng_ai` 在 `V1.1.8` 曾标记鼠标害羞链路和 `drag_hold_lift` 已 ready，并把 click/drag 四条动作列为待补。
- `V1.2.0` 后 click/drag 四条动作已从 video blocked 移出，完整 ready 状态以 profile manifest 和视频台账为准。
- `legacy_real` 使用保守声明，不继承古风 profile 交互。
- L4 `companion.events.subscribe` 尚未实现，保留为后续 TODO。
- package 版本升到 `1.1.8`。

## V1.1.9：MCP Permission Policy

定位：MCP L5 最小权限治理版本，让 agent 能读懂本地 companion methods 的风险分层和允许状态。

交付物：

- `data/config/permission_policy.config.json`
- 新增 `companion.permissions.summary`
- 新增 MCP tool：`companion_permissions_summary`
- `context.summary` 增加 `permissionPolicySummary`
- 控制中心 `AI 接入` 面板显示 policy enabled、blocked count 和 confirmation-required count。

验收状态：

- 默认策略不阻断既有 MCP 能力。
- 所有 protocol methods 都有 permission rule。
- disabled method 返回 permission denied 并记录活动。
- L4 `companion.events.subscribe` 尚未实现，保留为后续 TODO。
- package 版本升到 `1.1.9`。

## V1.2.0：交互动作补齐

状态：已完成。

定位：让桌宠从“状态展示”进一步变成“会回应用户”。鼠标靠近害羞已在 `V1.1.2` 先行落地并在 `V1.1.3` 调整节奏，`V1.2.0` 补齐点击和拖拽链路。

目标：

- 补齐 P1-A click/drag source videos。
- 完成 source -> keyframe -> WebM -> registry -> runtime 的闭环。
- 启用 `interaction_rules.config.json`。
- 只覆盖 `guofeng_ai`，不扩大到 `legacy_real`。

交付物：

- `click_head_happy`
- `click_body_confused`
- `drag_start_lift`
- `drag_hold_lift`
- `drag_end_dizzy`

当前已完成：

- 新增 `guofeng_ai` profile-scoped interaction rules。
- Renderer 接入 profile-scoped interaction 调度底座；hover/leave 已在 `V1.1.2` 形成完整链路并在 `V1.1.3` 加速。
- `click_head_happy`、`click_body_confused`、`drag_start_lift`、`drag_end_dizzy` 已补齐 source/WebM/keyframe/QA 并标记 runtime ready。
- `drag_hold_lift` 已按 `drag_start_lift` 尾帧和 `drag_end_dizzy` 首帧重新校准。
- 两个拖动衔接态使用 `2.0x` 输出加速。

## V1.2.1：Codex 授权提示修复

状态：已完成。

- Codex PermissionRequest 文案改为“请在 Codex 中确认授权”，不再与控制中心确认卡片混淆。
- Codex `waiting_auth` 增加 60 秒自动失效规则，兼容旧格式无 `expiresAt` 状态。
- MCP `companion.confirm.request` 的控制中心确认流保持不变。

## V1.2.2：原生点击命中与拖动节奏

状态：已完成。

- macOS helper 精准拦截人物 alpha 区域内的普通左键，透明区域继续穿透。
- 普通左键触发头部/身体动作；Option 仅用于抓起拖动。
- `drag_start_lift` 从 `2.0x` 提升为 `6.0x`。
- `mouse_leave_back` 保留临时运行，但进入待替换素材清单。

## V1.2.3：头部实体命中校准

状态：已完成。

- `guofeng_ai` 点击规则新增 profile-scoped `hitZones`。
- 头部使用人物实体 bbox 顶部 `34%`，轮廓容差为 `10px`。
- 动作切换期间保留上一帧有效 hit regions，避免头部点击短暂失效。

## V1.3.0：Profile Package

状态：已完成。

定位：把角色从内部目录升级为可导入、可预览、可校验的 profile package。

目标：

- 为 `legacy_real` 和 `guofeng_ai` 定义 package manifest。
- 包含 assets、action registry、states config、QA summary、license/provenance。
- 支持本地导入和 readiness 检查。

当前已完成：

- 内置 `legacy_real` 和 `guofeng_ai` 均具备 package manifest。
- 新增 `.companion-profile.zip` 导出、inspect、validate 和 install CLI。
- 控制中心支持导入与移除非内置角色。
- 缺非核心视频允许安装并显示 warning；缺 `idle` 或必需配置时禁止切换。
- 导入校验拒绝路径穿越、符号链接、可执行脚本和覆盖内置 profile。

## V1.4.0：声明式插件

状态：已完成。

定位：在不开放任意脚本执行、不等待视频素材的前提下，提供安全可控的本地能力扩展。

交付物：

- 内置与 Electron `userData` 本地 JSON manifest 扫描。
- `interval / idle / condition` trigger。
- `speech_pool / reaction_pool / random_action` effect。
- 插件开关持久化、控制中心“插件”页、刷新本地目录。
- `companion.plugins.summary` 与 `companion_plugins_summary`。
- `plugin_trigger / plugin_skip / plugin_error` activity。
- `npm run plugin:contract`。

不做：

- 不执行 JS、shell、动态模块，不访问网络，不写入插件文件。
- 不导入插件压缩包，不创建提醒，不修改任务，不切换 profile。
- 不实施 L4 `companion.events.subscribe`。

## V2.0.0：AI Companion Kernel

定位：明显大版本变化。桌宠不再只是 Electron app + 素材管线，而是本地 AI companion kernel。

目标：

- 稳定 agent protocol。
- 支持多 agent/project session。
- 具备可扩展能力注册和权限模型。
- 可以与 OpenClaw 类内核协同，而不是只接收消息。

判断是否进入 V2：

- 外部 agent 可以通过标准协议驱动桌宠动作、消息和 profile。
- 桌宠能表达任务上下文、工具状态和用户节奏。
- 权限、安全、测试、分发边界清晰。

## 发布预留

macOS/App Store 方向：

- 先做本地签名、公证、自动更新和隐私/权限清单评估。
- 控制素材包体积，保留可下载 profile package 的可能。
- 避免硬编码用户路径和不可声明权限。

开源方向：

- 核心 runtime、协议 schema、测试、示例 profile 可作为开源候选。
- 私有素材、生成源视频和商业 profile 与核心代码隔离。
- 每个可发布 profile 必须有 license/provenance manifest。
