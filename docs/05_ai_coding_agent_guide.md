# AI Coding Agent Guide

更新时间：2026-05-31
适用项目：Desktop AI Companion

## 项目一句话

这是一个本地桌面 AI 伙伴项目。当前优势是高质量透明视频动作资产和 profile 化桌宠运行时；下一阶段重点是接入 AI/Agent 协议层，让桌宠成为本地 companion kernel，而不是普通消息提醒 UI。

## 当前版本

- 当前版本：`V1.1.8`
- 基线冻结版本：`V1.0.0`
- npm 版本号：`1.1.8`
- 默认 profile：`legacy_real`
- 新 profile：`guofeng_ai`

## 接手前先看

优先阅读：

- `docs/00_overview.md`
- `docs/01_prd.md`
- `docs/02_roadmap.md`
- `docs/03_architecture.md`
- `docs/07_name_rule.md`
- `docs/08_decisions.md`
- `docs/09_mcp_capability_blueprint.md`
- `docs/10_video_supply_progress.md`

再按任务阅读：

- 资产/动作进度：`docs/generated/profiles/legacy_real/action_progress.md`
- 古风角色进度：`docs/generated/profiles/guofeng_ai/action_progress.md`
- 视频处理：`skills/white-bg-video-matting/README.md`

## 工作原则

- 以效果最好为最高优先级；需要新工具就说明原因并申请安装。
- 不要默认重构成 monorepo，当前仍以单 Electron app 更适合。
- 不要把桌宠定位写死为素材库。资产是当前优势，AI/Agent 内核是未来差异化。
- 不要让外部 agent 直接写内部 runtime/config 文件；要走协议层。
- 不要让 agent 文本直出桌面；所有气泡消息必须经过安全校验。
- 保留 source video，除非用户明确要求删除。
- 不要删除 `skills/white-bg-video-matting`。
- 工作区可能有大量既有改动，修改前看 `git status --short`，只碰当前任务相关文件。

## 常用命令

```bash
npm run typecheck
npm run agent:contract
npm run build
python3 scripts/verify_action_registry_runtime.py
python3 scripts/asset_check.py --strict --webm-strict
python3 scripts/pb2_video_pipeline.py check --skip-missing
npm run motion:progress
```

## 动作与素材规则

权威来源：

- 默认 profile action registry：`data/config/action_registry.config.json`
- 默认 profile state config：`data/config/states.config.json`
- 默认 profile motion catalog：`data/config/motion_catalog.config.json`
- 默认 profile source metadata：`data/config/motion_sources.config.json`
- profile 列表：`data/config/pet_profiles.config.json`
- 古风 profile 配置：`data/profiles/guofeng_ai/*.config.json`

新增动作时要同步：

- action registry
- motion catalog
- motion sources
- states config
- progress docs
- asset checks

P1-A 用户交互动作当前是 placeholder，source video 未补齐前不得标记为 runtime ready。

## AI/Agent 接入方向

`V1.1.0` 已落地：

- 本地 discovery/token 或等效本地授权入口。
- `companion.status`
- `companion.react`
- `companion.say`
- `companion.agent.set_state`
- `companion.agent.get_state`
- `companion.agent.clear_state`
- `companion.confirm.request`
- `companion.confirm.get`
- `companion.confirm.cancel`
- `companion.context.summary`
- `companion.activity.list`
- `companion.profile.list`
- `companion.profile.capabilities`
- message validator
- cooldown
- contract tests
- stdio MCP adapter：`node scripts/companion_mcp_server.mjs`
- Codex MCP 实机联调：`companion_status`、`companion_say`、`companion_react`

Codex MCP 注册示例：

```toml
[mcp_servers.desktop_ai_companion]
command = "node"
args = ["/Users/jiafei/workspace/Desktop AI Companion/scripts/companion_mcp_server.mjs"]
startup_timeout_sec = 30
```

最小联调口径：

- 启动 app 后确认 discovery 与 socket 生成。
- 在 Codex 中调用 `companion_status`，应返回 `appVersion`、`protocolVersion`、active profile 和可用 methods。
- 调用 `companion_say`，短消息应显示为桌宠气泡，可选触发 `success`。
- 间隔超过 cooldown 后调用 `companion_react`，如 `thinking`，桌宠应进入对应 reaction。
- 调用 `companion_agent_set_state`，桌宠应进入对应 agent 状态面板表达。
- 调用 `companion_confirm_request`，控制中心应出现确认卡片，用户响应后可用 `companion_confirm_get` 读取结果。
- 调用 `companion_context_summary`，应返回不含 token/socket/discovery/绝对路径的安全摘要。
- 调用 `companion_activity_list`，应返回最近有限条内存活动记录。
- 调用 `companion_profile_capabilities`，应返回当前 profile 的 ready、missing source、video blocked 和分发预留摘要。

反应映射原则：

- `thinking` -> `thinking`
- `editing` / `coding` -> `coding`
- `waiting` -> `reminder` 或后续 `waiting_auth`
- `success` -> `success`
- `error` -> `error`

不要为了接入 OpenPets 或类似项目而降低当前 WebM/keyframe/QA 管线精度。兼容层应包在 profile package 或 protocol adapter 上。

## V1.1.4 MCP 能力蓝图

当前只做规划，不改 runtime protocol：

- L1 已完成：`status / react / say / profile.list / profile.select`。
- L2 已落地：agent 状态面板，表达 working、waiting_auth、blocked、testing、done 等状态。
- L3 已落地最小闭环：用户确认流，让 agent 的授权请求能通过控制中心表达和回收。
- L4 已落地最小只读能力：上下文摘要和活动记录，减少轮询并服务多 agent；`companion.events.subscribe` 尚未实现。
- L5 已落地最小 profile 能力声明；插件能力、权限和偏好仍是后续 companion kernel 范围。

实现边界：

- 不要把候选方法写成已实现工具。
- 新增 MCP 方法前必须同步 local protocol、stdio adapter、contract check 和 Codex MCP smoke test。
- MCP 的目标不是做聊天窗口，而是把 agent 的状态、意图、确认和结果翻译成本地 companion 体验。

## V1.1.5 MCP Agent 状态面板

当前已落地：

- `companion.agent.set_state({ status, message?, ttlMs? })`
- `companion.agent.get_state()`
- `companion.agent.clear_state()`
- stdio MCP tools：`companion_agent_set_state`、`companion_agent_get_state`、`companion_agent_clear_state`

状态映射：

- `working` -> `coding`
- `testing` -> `thinking`
- `waiting_auth` -> `waiting_auth`
- `blocked` -> `error`
- `done` -> `success`
- `idle` -> clear

实现边界：

- `set_state` 使用 message validator 和 cooldown。
- `clear_state` 不受 cooldown 限制。
- 确认流已在 `V1.1.6` 作为独立能力落地。

## V1.1.6 MCP 用户确认流

当前已落地：

- `companion.confirm.request({ title, message, ttlMs? })`
- `companion.confirm.get()`
- `companion.confirm.cancel()`
- stdio MCP tools：`companion_confirm_request`、`companion_confirm_get`、`companion_confirm_cancel`

实现边界：

- 第一版只支持单个 pending confirmation。
- 控制中心是 `V1.1.6` 的临时用户响应入口，桌宠本体先只表达 `waiting_auth`。
- 后续补齐确认/授权动作和气泡组件后，应把主确认入口迁移到桌宠气泡，控制中心保留为观察和兜底。
- MCP 不暴露 respond 方法，避免 agent 伪造 `allow / deny / cancel`。
- title/message 继续复用安全 validator。

## V1.1.7 MCP 上下文摘要与活动记录

当前已落地：

- `companion.context.summary()`
- `companion.activity.list({ limit? })`
- stdio MCP tools：`companion_context_summary`、`companion_activity_list`
- 人工视频台账：`docs/10_video_supply_progress.md`

实现边界：

- `context.summary` 不暴露 token、socket path、discovery path、绝对路径或长日志。
- `activity.list` 默认 20 条，最大 50 条。
- 活动记录只在 Electron main 内存中保留，不落盘、不跨重启。
- 本轮不是 streaming event subscribe，`companion.events.subscribe` 尚未实现，后续事件流单独规划。

## V1.1.8 Profile Capability Manifest

当前已落地：

- `companion.profile.capabilities({ profileId? })`
- stdio MCP tool：`companion_profile_capabilities`
- `data/profiles/<profile>/profile_manifest.config.json`
- `context.summary` 中的 `profileCapabilitiesSummary`

实现边界：

- manifest 用于告诉 agent 当前 profile 能做什么、缺什么、哪些能力只是临时入口。
- `guofeng_ai` 的 click/drag 四条 P0 动作继续标记为缺 source，不允许当成 runtime ready。
- `legacy_real` 使用保守能力声明，不继承古风 profile 的新交互。
- 返回内容不得包含 token、socket path、discovery path、绝对素材路径或本地 cwd。
- L4 `companion.events.subscribe` 仍是 TODO，不要在 agent 行为里假设有 streaming event。

## V1.1.2 鼠标靠近害羞接入

当前已落地：

- `mouse_hover_look`：正常到害羞。
- `mouse_shy_loop`：害羞循环。
- `mouse_leave_back`：害羞到正常。
- 三条动作以冻结 `idle` 实际人物大小对齐。
- QA 输出需重点看头、脚、发丝、袖口和右下角光标/水印区域。

实现边界：

- 鼠标靠近/移开是低优先级交互，不抢占 task/reminder/agent/Codex 状态。
- 不做鼠标方向预判；靠近身体但不点击时进入害羞循环。
- click/drag 仍是后续动作，不属于 `V1.1.2`。

## V1.1.3 鼠标害羞节奏补丁

当前已落地：

- `mouse_hover_look` 和 `mouse_leave_back` 使用 `speedFactor: 1.75`。
- `mouse_shy_loop` 使用 `speedFactor: 1.5`。
- 原始 source mp4 不覆盖，只在透明 WebM 输出阶段加速。
- 加速后仍沿用 `guofeng_mouse_cursor` 水印清理和 idle 对齐 preset。

实现边界：

- 只调整鼠标害羞三段动作节奏。
- 不改变 hover -> shy loop -> leave 的 runtime 语义。
- 不启用 click/drag，也不将 `V1.2.0` 标记完成。

## V1.2.0 用户交互接入

当前方向：

- 只覆盖 `guofeng_ai`。
- `legacy_real` 不补 P1-A 素材，不启用 profile-scoped 交互。
- 交互规则入口：`data/profiles/guofeng_ai/interaction_rules.config.json`
- 视频生成提示词：`docs/generated/profiles/guofeng_ai/p1_interaction_video_prompts.md`
- 视频供给台账：`docs/10_video_supply_progress.md`

实现边界：

- click 是中优先级交互，不抢占 task/reminder/agent/Codex 状态。
- drag 后续使用 `drag_start_lift -> drag_hold_lift -> drag_end_dizzy`。
- 在 source videos、透明 WebM、fallback keyframe 和 QA 未到位前，不得把 P1-A 动作标记为 runtime ready。
- 当前没有可调用的视频生成工具时，保留工程接入和提示词，不用低质量本地占位冒充 AI 视频。

## 分发与开源预留

写代码时保持这些边界：

- 核心 runtime 和素材资产要可拆分。
- profile/package 需要 license/provenance manifest。
- 不把本机私有路径写成产品依赖。
- macOS 权限应可解释、可关闭、可记录。
- 插件先做声明式和白名单能力，不默认运行任意脚本。

## 完成任务时的最低交付

- 修改说明。
- 影响范围。
- 验证命令和结果。
- 未验证原因，若有。
- 若改动版本号或发布范围，更新 `docs/06_progress.md` 和 `docs/08_decisions.md`。
