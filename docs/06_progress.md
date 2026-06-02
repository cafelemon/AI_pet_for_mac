# Process And Progress

更新时间：2026-06-01

## 工作流程

1. 先确认任务属于文档、运行时、动作资产、profile、AI/Agent 接入、分发/开源预留中的哪一类。
2. 修改前检查当前文件和 `git status --short`。
3. 对动作/素材改动，同步 registry、motion catalog、motion sources、states config 和 progress docs。
4. 对 AI/Agent 接入改动，先写协议 contract，再接 Electron/renderer。
5. 对分发/开源相关改动，记录 license/provenance、权限和隐私影响。
6. 完成后运行与改动范围匹配的验证命令。
7. 更新进度和决策记录。

## 当前状态：V1.4.0

日期：2026-06-01

已完成：

- 冻结当前项目状态为 `V1.0.0`。
- 根 npm 版本号更新为 `1.0.0`。
- 整合 docs 架构。
- 明确 `MAJOR.MINOR.PATCH` 版本规则。
- 明确 `V1.1.0` 是首个 AI/Agent 接入版本。
- 明确未来差异化从资产表现升级为 companion kernel。
- 为 macOS/App Store、开源平台、profile package 和插件系统预留边界。
- `V1.1.0` 新增本地 Unix socket companion protocol。
- 新增 discovery 文件、启动 token、NDJSON request/response。
- 新增 `companion.status`、`companion.react`、`companion.say`、`companion.profile.list`、`companion.profile.select`。
- 新增 agent runtime 状态层、message validator、reaction mapping 和 cooldown。
- 新增 stdio MCP adapter 与 `npm run agent:contract`。
- 控制中心新增 `AI 接入` 面板。
- 完成 Codex MCP 注册联调：`companion_status` 可读取 app/profile/protocol 状态。
- 完成 Codex MCP 动作联调：`companion_say` 可显示短消息并触发 `success`，`companion_react` 可触发 `thinking`。
- 验证连续 `say/react` 会触发 1500ms cooldown，符合安全节流设计。
- `V1.1.2` 完成鼠标靠近害羞循环交互。
- `V1.1.3` 完成鼠标害羞交互节奏加速。
- `V1.1.4` 完成 MCP 能力蓝图，不改变当前运行版本。
- `V1.1.5` 完成 MCP Agent 状态面板。
- `V1.1.6` 完成 MCP 用户确认流。
- `V1.1.7` 完成视频供给台账和 MCP 上下文摘要。
- `V1.1.8` 完成 profile 能力声明和 MCP 查询入口。
- `V1.1.9` 完成 MCP permission policy 最小治理层。
- `V1.2.0` 完成 `guofeng_ai` click/drag 用户交互动作补齐。
- `V1.2.1` 修复 Codex 授权提示残留和确认入口混淆。
- `V1.2.2` 修复人物点击穿透，并将拖动起始态提升为 `6.0x`。
- `V1.2.3` 校准头部实体命中区域，修复头部点击难以触发。
- `V1.3.0` 完成本地 Profile Package：内置角色可导出，控制中心可导入和移除非内置角色，缺非核心视频只形成 warning。
- `V1.4.0` 完成声明式插件运行时：安全 JSON manifest、低优先级展示反馈、控制中心插件页、只读 MCP summary 和 contract。

## 当前待办

- 手动验证 click/drag 交互。
- 等待用户补充新的 `mouse_leave_back` 视频，替换当前 QA 不合格的临时素材。
- 继续推进 `guofeng_ai` profile 素材完整度。
- L4 `companion.events.subscribe` 尚未实现，后续单独推进；L5 已先落地 profile capability manifest 和 permission policy。

## V1.1.2 过程记录

日期：2026-05-29
版本：V1.1.2
类型：PATCH / asset / runtime

已完成：

- `mouse_hover_look`、`mouse_shy_loop`、`mouse_leave_back` 三段鼠标靠近害羞动作接入。
- 三段素材从桌面古风素材目录复制到 `guofeng_ai` interaction assets。
- 视频管线新增 `guofeng_mouse_cursor` 遮罩和鼠标害羞动作的 idle 对齐 preset。
- Renderer 行为改为：靠近播放正常到害羞，停留进入害羞循环，移开播放害羞到正常。
- 多底色 QA 已生成，重点检查头脚和水印/光标区域。
- package 版本升到 `1.1.2`。

## V1.1.3 过程记录

日期：2026-05-30
版本：V1.1.3
类型：PATCH / asset / runtime

已完成：

- `mouse_hover_look` 和 `mouse_leave_back` 配置 `speedFactor: 1.75`。
- `mouse_shy_loop` 配置 `speedFactor: 1.5`。
- 视频管线支持在透明 WebM 输出阶段应用 `setpts=PTS/<speedFactor>,fps=24`。
- 三段动作重新生成 WebM、fallback keyframe、contact 和多底色 QA。
- `states.config.json` 中三段动作时长更新为 `2875ms / 3375ms / 2875ms`。
- package 版本升到 `1.1.3`。

## V1.1.4 过程记录

日期：2026-05-31
版本：V1.1.4 blueprint
类型：PATCH / docs / protocol

已完成：

- 新增 `docs/09_mcp_capability_blueprint.md`。
- 明确 L1 当前 MCP 能力已经完成，L2-L5 作为后续规划。
- 明确 `V1.1.3` 继续作为当前运行版本，`V1.1.4` 不改 package 版本。
- 当时明确 click/drag 缺素材动作继续留在 `V1.2.0`，当前已在 `V1.2.0` 补齐。
- 明确后续新增 MCP 方法前需要同步 protocol、adapter、contract check 和 Codex MCP smoke test。

## V1.1.5 过程记录

日期：2026-05-31
版本：V1.1.5
类型：PATCH / protocol / runtime

已完成：

- 新增 `companion.agent.set_state`、`companion.agent.get_state`、`companion.agent.clear_state`。
- 新增 `companion_agent_set_state`、`companion_agent_get_state`、`companion_agent_clear_state` MCP tools。
- 支持 `working / testing / waiting_auth / blocked / done / idle` 语义状态。
- 控制中心 AI 接入面板展示 semantic status、runtime state 和 expiresAt。
- contract check 覆盖 agent status mapping 和 MCP adapter tools。
- package 版本升到 `1.1.5`。

## V1.1.6 过程记录

日期：2026-05-31
版本：V1.1.6
类型：PATCH / protocol / runtime

已完成：

- 新增 `companion.confirm.request`、`companion.confirm.get`、`companion.confirm.cancel`。
- 新增 `companion_confirm_request`、`companion_confirm_get`、`companion_confirm_cancel` MCP tools。
- 控制中心 AI 接入面板展示 confirmation 卡片和 `允许 / 拒绝 / 取消`。
- pending confirmation 自动打开控制中心并使桌宠进入 `waiting_auth`。
- 用户响应只通过 renderer IPC 完成，MCP 不暴露 respond 方法。
- 记录当前控制中心确认卡片只是临时 UI；后续补齐专门动作和气泡后，确认入口迁移到桌宠气泡。
- package 版本升到 `1.1.6`。

## V1.1.7 过程记录

日期：2026-05-31
版本：V1.1.7
类型：PATCH / protocol / docs

已完成：

- 新增 `docs/10_video_supply_progress.md`，单独记录视频供给进度。
- 新增 `companion.context.summary` 和 `companion.activity.list`。
- 新增 `companion_context_summary` 和 `companion_activity_list` MCP tools。
- Electron main 新增内存 ring buffer 记录最近 companion 活动。
- `context.summary` 避免暴露 token、socket path、discovery path、绝对路径和长日志。
- package 版本升到 `1.1.7`。

## V1.1.8 过程记录

日期：2026-05-31
版本：V1.1.8
类型：PATCH / protocol / docs

已完成：

- 新增 `profile_manifest.config.json`，分别覆盖 `guofeng_ai` 与 `legacy_real`。
- `guofeng_ai` 当时明确标记鼠标害羞链路和 `drag_hold_lift` 已 ready，四个 click/drag P0 动作缺 source；当前 manifest 已随 `V1.2.0` 更新为 ready。
- `legacy_real` 使用保守能力声明，不继承古风 profile 交互。
- 新增 `companion.profile.capabilities` 和 `companion_profile_capabilities`。
- `context.summary` 增加 `profileCapabilitiesSummary`。
- 文档明确 L4 `companion.events.subscribe` 尚未实现。
- package 版本升到 `1.1.8`。

## V1.1.9 过程记录

日期：2026-06-01
版本：V1.1.9
类型：PATCH / protocol / governance

已完成：

- 新增 `data/config/permission_policy.config.json`。
- 新增 `companion.permissions.summary` 和 `companion_permissions_summary`。
- `context.summary` 增加 `permissionPolicySummary`。
- Electron main 在 local protocol method 执行前做最小 allow/deny 检查。
- 控制中心 AI 接入面板展示 policy enabled、blocked count 和 confirmation-required count。
- 默认策略不阻断既有 MCP 能力。
- contract check 覆盖所有 methods 都有 permission rule，以及 disabled method 返回 permission denied。
- package 版本升到 `1.1.9`。

## V1.2.0 过程记录

日期：2026-06-01
版本：V1.2.0
类型：MINOR / asset / runtime

已完成：

- 新增 `guofeng_ai` profile-scoped interaction rules。
- Renderer 新增 profile-scoped interaction 调度底座；hover/leave 已在 `V1.1.2` 形成完整链路，并在 `V1.1.3` 调整节奏。
- 接入四个桌面新增源视频：`点击头部.mp4`、`点击身体.mp4`、`拖动起始衔接.mp4`、`拖动回落衔接.mp4`。
- 生成 `click_head_happy`、`click_body_confused`、`drag_start_lift`、`drag_end_dizzy` 透明 WebM、fallback keyframe 和多底色 QA。
- `drag_start_lift` 和 `drag_end_dizzy` 使用 `2.0x` 输出加速。
- `drag_hold_lift` 已按 `drag_start_lift` 尾帧和 `drag_end_dizzy` 首帧重新校准。
- Renderer 新增点击命中区域上半/下半分流，分别触发 `click_head` 和 `click_body`。
- `interaction_rules.config.json` 启用 click/drag start/hold/end。
- package 版本升到 `1.2.0`。

风险：

- 手动 click/drag 交互仍需在桌面 app 中最终确认触发手感。

## V1.2.1 过程记录

日期：2026-06-01
版本：V1.2.1
类型：PATCH / runtime / docs

已完成：

- 区分 Codex PermissionRequest 与 MCP confirmation：Codex 文案改为“请在 Codex 中确认授权”。
- Codex hook 的 `waiting_auth` 写入 60 秒 `expiresAt`。
- Electron main 对旧格式无 `expiresAt` 的 Codex `waiting_auth` 增加 60 秒自动失效规则。
- MCP `companion.confirm.request` 的控制中心临时确认入口保持不变。
- package 版本升到 `1.2.1`。

## V1.2.2 过程记录

日期：2026-06-01
版本：V1.2.2
类型：PATCH / runtime / asset / docs

已完成：

- macOS input helper 新增 profile-scoped 普通左键精准捕获，只拦截人物 alpha 命中区域。
- 新增 `interaction:click` renderer IPC，复用头部/身体点击分流。
- Option + 左键继续用于抓起拖动；人物外透明区域继续穿透。
- `drag_start_lift` 从 `2.0x` 提升为 `6.0x`，重新生成透明 WebM、keyframe 和多底色 QA。
- `mouse_leave_back` 标记为临时可运行但 QA 不合格，等待替换视频。
- package 版本升到 `1.2.2`。

## V1.2.3 过程记录

日期：2026-06-01
版本：V1.2.3
类型：PATCH / runtime / docs

已完成：

- `guofeng_ai` 新增 profile-scoped `hitZones`，头部区间为人物实体 bbox 顶部 `34%`。
- 人物 alpha 轮廓点击容差调整为 `10px`。
- 动作切换时保留上一帧有效 regions，避免异步重建期间头部点击落空。
- 拖动开始时直接进入 `drag_hold_lift` 循环，不再派发 `drag_start_lift`。
- 拖动释放后保留 `drag_end_dizzy` 落地收尾动作。
- package 版本升到 `1.2.3`。

## 过程记录模板

```text
日期：
版本：
类型：MAJOR / MINOR / PATCH / docs / asset / protocol
改动：
影响范围：
验证：
风险：
后续：
```

## 下一次推荐切入

建议先手动验收人物点击和 Option 拖动手感，并从控制中心导入一个非内置测试包。新 `mouse_leave_back` 视频到位后优先替换；代码层可继续推进长期偏好或 L4 `companion.events.subscribe`。

## V1.3.0 过程记录

日期：2026-06-01
版本：V1.3.0
类型：MINOR / profile package / distribution

已完成：

- 为 `legacy_real` 和 `guofeng_ai` 新增 package manifest。
- 新增 `scripts/profile_package.py`，支持 `export / inspect / validate / install`。
- 控制中心设置页新增本地角色包导入和非内置角色移除入口。
- Electron main 合并内置与已安装 profile，并为已安装资产提供受控 namespace。
- 安装校验拒绝路径穿越、绝对路径、符号链接、可执行脚本、异常包和覆盖内置 profile。
- 缺非核心视频允许安装并形成 warning；缺 `idle` 或必需配置时禁止切换。
- `npm run profile:contract` 覆盖导出、校验、重复安装和恶意包拒绝。
- 已手动导入非内置测试包，验证 warning、切换、已安装资产渲染、移除和回落默认 profile；测试后恢复为 `guofeng_ai`。
- package 版本升到 `1.3.0`。

## V1.4.0 过程记录

日期：2026-06-02
版本：V1.4.0
类型：MINOR / declarative plugin runtime / governance

已完成：

- 新增 `app/electron/declarativePlugins.ts`，集中处理加载、严格校验、启停持久化、调度、cooldown、TTL、summary 和错误。
- 新增三个默认关闭内置示例：`idle_greeting`、`agent_done_encouragement`、`guofeng_ambient_action`。
- 新增低优先级 `plugin:feedback` renderer IPC；高优先级 runtime 由 main 拒绝，本地 hover/click/drag 由 renderer 二次拒绝或中断。
- 控制中心新增“插件”页，支持启停与刷新本地目录。
- 新增 `companion.plugins.summary`、`companion_plugins_summary` 和 `context.summary.pluginSummary`。
- activity ring buffer 新增 `plugin_trigger / plugin_skip / plugin_error`。
- 新增 `npm run plugin:contract`。
- package 版本升到 `1.4.0`；profile package 自身版本仍保持 `1.3.0`。

边界：

- 不开放 JS、shell、动态模块、网络请求、文件写入或插件压缩包导入。
- L4 `companion.events.subscribe` 继续保留为后续 TODO。
- 缺失或 QA 不合格视频继续只更新台账和 manifest，不生成占位素材。
