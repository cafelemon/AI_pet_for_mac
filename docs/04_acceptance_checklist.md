# Acceptance Checklist

更新时间：2026-06-01

## V1.0.0 文档冻结验收

- [ ] 根版本号为 `1.0.0`。
- [ ] `README.md` 指向当前 docs 体系。
- [ ] `docs/00_overview.md` 说明当前冻结基线。
- [ ] `docs/01_prd.md` 说明产品目标、AI/Agent 方向、分发与开源预留。
- [ ] `docs/02_roadmap.md` 包含 `V1.1.0` AI/Agent 接入版本。
- [ ] `docs/03_architecture.md` 描述当前架构与目标协议架构。
- [ ] `docs/05_ai_coding_agent_guide.md` 能指导下一个 AI coding agent 接手。
- [ ] `docs/07_name_rule.md` 定义 `MAJOR.MINOR.PATCH` 规则。
- [ ] `docs/08_decisions.md` 记录 V1 冻结与未来方向决策。

## 当前运行时验收

建议命令：

```bash
npm run typecheck
npm run agent:contract
npm run profile:contract
npm run plugin:contract
npm run build
python3 scripts/verify_action_registry_runtime.py
python3 scripts/asset_check.py --strict --webm-strict
python3 scripts/pb2_video_pipeline.py check --skip-missing
npm run motion:progress
```

通过标准：

- TypeScript 无类型错误。
- Agent protocol contract 通过。
- Electron build 成功。
- registry/runtime contract 通过。
- 已完成 runtime actions 的 WebM/keyframe/source 路径完整。
- 缺失的 P1-A 和桥接动作只以 placeholder 形式存在，不被误判为 runtime ready。
- `docs/generated/profiles/legacy_real/action_progress.md` 与当前配置一致。

## 新动作接入验收

- [ ] source video 放入 progress doc 指定路径。
- [ ] `motion_sources.config.json` provider/matte/crop 信息正确。
- [ ] `motion_catalog.config.json` 包含 stage/category/playback/runtime 标记。
- [ ] `action_registry.config.json` 有 action path、webmPath、fallbackPath。
- [ ] `states.config.json` 包含需要的时长和播放规则。
- [ ] 生成 keyframe 与透明 WebM。
- [ ] `python3 scripts/asset_check.py --strict --webm-strict` 通过。
- [ ] `npm run motion:progress` 后 progress doc 更新。

## V1.1.2 鼠标靠近害羞验收

- [x] `guofeng_ai` 有 profile-scoped `interaction_rules.config.json`。
- [x] Renderer 已接入 hover、leave 调度层。
- [x] `mouse_hover_look` 使用 `正常到害羞.mp4` 接入。
- [x] `mouse_shy_loop` 使用 `害羞循环2.mp4` 接入。
- [x] `mouse_leave_back` 使用 `害羞到正常.mp4` 接入。
- [x] `mouse_hover_look` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [x] `mouse_shy_loop` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [x] `mouse_leave_back` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [x] 三条动作使用 `idle` 对齐 preset。
- [x] 三条动作均生成 transparent WebM、fallback keyframe、contact 和多底色 QA。
- [x] `guofeng_mouse_cursor` 遮罩用于处理右下角光标/水印区域。
- [x] package 版本升到 `1.1.2`。

## V1.1.3 鼠标害羞节奏加速验收

- [x] `mouse_hover_look` 配置 `speedFactor: 1.75`。
- [x] `mouse_shy_loop` 配置 `speedFactor: 1.5`。
- [x] `mouse_leave_back` 配置 `speedFactor: 1.75`。
- [x] 三条动作重新生成 transparent WebM、fallback keyframe、contact 和多底色 QA。
- [x] `states.config.json` 中三条动作时长更新为加速后的 runtime 时长。
- [x] 原始 source mp4 保持不变。
- [x] package 版本升到 `1.1.3`。

## V1.1.4 MCP 能力蓝图验收

- [x] `V1.1.4` 不改变当时的 package/runtime 版本。
- [x] 当时 click/drag 缺素材动作继续保留为 `V1.2.0` 待补项；当前已在 `V1.2.0` 补齐。
- [x] `docs/09_mcp_capability_blueprint.md` 明确 L1-L5 能力分层。
- [x] 蓝图只记录候选方法，不承诺当前可调用。
- [x] 蓝图明确不新增远程 HTTP、不引入 MCP SDK、不改变既有 Codex MCP 链路。

## V1.1.5 MCP Agent 状态面板验收

- [x] 新增 `companion.agent.set_state/get_state/clear_state` local protocol methods。
- [x] 新增 `companion_agent_set_state/get_state/clear_state` MCP tools。
- [x] `working/testing/waiting_auth/blocked/done/idle` 映射到预期 runtime state。
- [x] `set_state` message 复用安全 validator。
- [x] `clear_state` 不受 cooldown 限制。
- [x] 控制中心 AI 接入面板展示 agent semantic status、runtime state 和 expiresAt。
- [x] package 版本升到 `1.1.5`。

## V1.1.6 MCP 用户确认流验收

- [x] 新增 `companion.confirm.request/get/cancel` local protocol methods。
- [x] 新增 `companion_confirm_request/get/cancel` MCP tools。
- [x] confirmation title/message 复用安全 validator。
- [x] pending confirmation 自动进入 `waiting_auth`。
- [x] 控制中心 AI 接入面板展示确认卡片和 `允许 / 拒绝 / 取消`。
- [x] 用户响应只通过 renderer IPC 完成，MCP 不暴露 respond 方法。
- [x] package 版本升到 `1.1.6`。

## V1.1.7 视频供给台账 + MCP 上下文摘要验收

- [x] 新增 `docs/10_video_supply_progress.md` 人工视频供给台账。
- [x] 新增 `companion.context.summary/activity.list` local protocol methods。
- [x] 新增 `companion_context_summary/companion_activity_list` MCP tools。
- [x] `context.summary` 不暴露 token、socket path、discovery path、绝对路径或长日志。
- [x] `activity.list` 默认 20 条、最大 50 条，非法 limit 返回错误。
- [x] 活动记录仅为 Electron main 内存 ring buffer，不落盘。
- [x] package 版本升到 `1.1.7`。

## V1.1.8 Profile Capability Manifest 验收

- [x] `pet_profiles.config.json` 为 `guofeng_ai` 和 `legacy_real` 挂载 `profileManifestPath`。
- [x] 新增 `companion.profile.capabilities` local protocol method。
- [x] 新增 `companion_profile_capabilities` MCP tool。
- [x] `context.summary` 增加安全的 `profileCapabilitiesSummary`。
- [x] `guofeng_ai` manifest 标记鼠标害羞链路和 `drag_hold_lift` 已 ready。
- [x] `guofeng_ai` manifest 在 `V1.1.8` 曾标记 click/drag 缺 source；`V1.2.0` 已移出 video blocked。
- [x] `legacy_real` 使用保守能力声明，不误报古风交互能力。
- [x] 文档明确 L4 `companion.events.subscribe` 尚未实现。
- [x] package 版本升到 `1.1.8`。

## V1.1.9 MCP Permission Policy 验收

- [x] 新增 `data/config/permission_policy.config.json`。
- [x] 新增 `companion.permissions.summary` local protocol method。
- [x] 新增 `companion_permissions_summary` MCP tool。
- [x] `context.summary` 增加安全的 `permissionPolicySummary`。
- [x] 控制中心 AI 接入面板展示 permission policy enabled、blocked count 和 confirmation-required count。
- [x] 默认 permission policy 不阻断既有 MCP 能力。
- [x] policy 中所有 `COMPANION_PROTOCOL_METHODS` 都有规则。
- [x] disabled method 会返回 permission denied 并记录活动。
- [x] 文档明确 `V1.1.9` 不是完整权限弹窗系统。
- [x] package 版本升到 `1.1.9`。

## V1.2.0 用户交互动作验收

- [x] `guofeng_ai` 有 profile-scoped `interaction_rules.config.json`。
- [x] Renderer 已具备 profile-scoped interaction 调度底座。
- [x] `click_head_happy` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [x] `click_body_confused` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [x] `drag_start_lift` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [x] `drag_end_dizzy` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [x] Renderer 按点击命中区域上半/下半分流 `click_head` / `click_body`。
- [x] 拖动链路按 `drag_start_lift -> drag_hold_lift -> drag_end_dizzy` 接入。
- [ ] 手动验证 click/drag 交互均可触发正确动作。
- [x] package 版本升到 `1.2.0`。

## V1.2.1 Codex 授权提示验收

- [x] Codex PermissionRequest 文案明确提示在 Codex 中确认授权。
- [x] 新 Codex `waiting_auth` 状态写入 60 秒 `expiresAt`。
- [x] Electron main 清理旧格式中超过 60 秒的无 `expiresAt` `waiting_auth`。
- [x] MCP confirmation 控制中心卡片行为保持不变。
- [x] package 版本升到 `1.2.1`。

## V1.2.2 原生点击与拖动节奏验收

- [x] macOS helper 仅在 profile 启用 click rules 时拦截人物 alpha 区域普通左键。
- [x] 人物外透明区域继续穿透桌面。
- [x] 普通点击按命中区域分流 `click_head` / `click_body`；Option 仅用于抓起拖动。
- [x] `drag_start_lift` 使用 `speedFactor: 6.0` 重转 WebM、keyframe 和多底色 QA。
- [x] `mouse_leave_back` 保留临时运行并标记为 QA 不合格、待替换。
- [ ] 手动验证人物点击不再触发 macOS 显示桌面。
- [ ] 手动验证 Option + 拖动起始反馈节奏自然。
- [x] package 版本升到 `1.2.2`。

## V1.4.0 声明式插件运行时验收

- [x] 新增内置与 Electron `userData` 本地 manifest 扫描。
- [x] 三个内置示例默认关闭。
- [x] manifest 拒绝重复 ID、未知 trigger/effect、脚本字段、URL、绝对路径、危险消息、未知 reaction 和非法 TTL。
- [x] interval、idle、condition 边沿和 cooldown 进入 contract。
- [x] random action 只从当前 profile runtime-ready action 中选择。
- [x] 控制中心新增“插件”页，支持启停和刷新本地目录。
- [x] 开关覆盖值持久化到 Electron `userData`，不修改 repo manifest。
- [x] 新增 `companion.plugins.summary` 和 `companion_plugins_summary`。
- [x] `context.summary` 增加安全 `pluginSummary`。
- [x] activity ring buffer 增加 `plugin_trigger / plugin_skip / plugin_error`。
- [x] `npm run typecheck`、`npm run build`、`npm run agent:contract`、`npm run profile:contract`、`npm run plugin:contract` 通过。
- [ ] 手动验证插件页、开关重启保留、本地合法/非法 manifest 刷新。
- [ ] 手动验证 reminder、task、Agent、Codex 和用户交互不会被插件抢占。

## V1.2.3 头部实体命中验收

- [x] `guofeng_ai` 配置 `hitZones.clickHeadMaxYRatio: 0.34`。
- [x] 人物 alpha 轮廓点击容差调整为 `10px`。
- [x] 动作切换时空 regions 不覆盖上一帧有效命中区域。
- [x] 拖动开始直接进入 `drag_hold_lift` 循环，不播放 `drag_start_lift`。
- [x] 拖动释放后仍播放 `drag_end_dizzy` 收尾。
- [ ] 手动验证点击脸部或头发区域触发 `click_head_happy`。
- [ ] 手动验证点击身体仍触发 `click_body_confused`。
- [x] package 版本升到 `1.2.3`。

## V1.1.0 AI/Agent 接入验收

- [x] 有本地 protocol/discovery schema。
- [x] 有 `status`、`react`、`say`、`profile.list` 的 contract checks。
- [x] `say` 有 message validator。
- [x] 拒绝路径、URL、密钥、代码块、日志堆栈和长工具输出。
- [x] `react` 只能触发白名单 reaction/action。
- [x] MCP stdio adapter 已提供本地工具入口。
- [x] 控制中心能显示 AI/Agent 接入状态。
- [x] Codex MCP 注册后可调用 `companion_status` 并读取 `V1.1.0` runtime/profile 状态。
- [x] Codex MCP 可调用 `companion_say`，桌宠显示短消息并触发 `success` reaction。
- [x] Codex MCP 可调用 `companion_react`，桌宠进入 `thinking` reaction。
- [x] `say/react` cooldown 在连续调用时返回结构化错误，不破坏运行时状态。

## V1.3.0 本地 Profile Package 验收

- [x] `legacy_real` 和 `guofeng_ai` 都有 `profile_package.config.json`。
- [x] CLI 支持 `export / inspect / validate / install`。
- [x] 控制中心支持导入和移除非内置角色。
- [x] 缺非核心视频的包可安装并显示 warning；缺 `idle` 或必需配置时拒绝激活。
- [x] 已安装资产通过受控 asset namespace 读取，不向 renderer 暴露本机绝对路径。
- [x] contract checks 覆盖路径穿越、符号链接、可执行脚本、缺 required asset 和覆盖内置角色拒绝。
- [x] 手动从控制中心导入一个非内置测试角色包，并验证切换、warning 和移除回落。
- [x] package 版本升到 `1.3.0`。

## 分发/开源预留验收

- [ ] 新增 profile 或素材时记录 license/provenance。
- [ ] 不把私有素材与未来开源核心强耦合。
- [ ] 不硬编码用户本机绝对路径作为运行时依赖。
- [ ] 新增权限时记录用途和关闭方式。
- [ ] 新增网络能力时记录数据流向和隐私影响。
