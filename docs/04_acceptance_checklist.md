# Acceptance Checklist

更新时间：2026-05-30

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
- [x] click/drag 缺素材动作继续保留为 `V1.2.0` 待补项。
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
- [x] `guofeng_ai` manifest 标记 `click_head_happy/click_body_confused/drag_start_lift/drag_end_dizzy` 缺 source 且 video blocked。
- [x] `legacy_real` 使用保守能力声明，不误报古风交互能力。
- [x] 文档明确 L4 `companion.events.subscribe` 尚未实现。
- [x] package 版本升到 `1.1.8`。

## V1.2.0 用户交互动作验收

- [x] `guofeng_ai` 有 profile-scoped `interaction_rules.config.json`。
- [x] Renderer 已具备 profile-scoped interaction 调度底座。
- [ ] `click_head_happy` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [ ] `click_body_confused` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [ ] `drag_start_lift` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [ ] `drag_end_dizzy` source/WebM/keyframe/QA 到位并标记 runtime ready。
- [ ] 手动验证 click/drag 交互均可触发正确动作。
- [ ] 验收通过后 package 版本升到 `1.2.0`。

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

## 分发/开源预留验收

- [ ] 新增 profile 或素材时记录 license/provenance。
- [ ] 不把私有素材与未来开源核心强耦合。
- [ ] 不硬编码用户本机绝对路径作为运行时依赖。
- [ ] 新增权限时记录用途和关闭方式。
- [ ] 新增网络能力时记录数据流向和隐私影响。
