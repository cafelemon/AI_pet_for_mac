# Desktop AI Companion Overview

更新时间：2026-06-01
当前版本：`V1.3.0`
基线冻结版本：`V1.0.0`

## 项目定位

Desktop AI Companion 是一个本地桌面 AI 伙伴项目。当前形态是 Electron + React 桌宠应用，围绕高质量透明 WebM 动作资产、profile 化角色配置、控制中心、任务/提醒和 Codex runtime 状态联动建立可运行基线。

短期差异化可以表达为“高质量资产驱动的本地桌宠体验”；长期差异化不能停在资产数量上。后续产品主线应转向 AI/Agent 层：桌宠本身成为本地 AI companion runtime，能被 agent 安全调用，能把外部工作状态翻译为动作、气泡、提醒、情绪和项目上下文，而不是只做消息喇叭。

## V1.0.0 冻结范围

`V1.0.0` 冻结的是当前已经能运行、能校验、能继续扩展的基线：

- 本地 Electron + React 桌宠运行时。
- `legacy_real` 真人桌宠 profile 作为默认可用形象。
- `guofeng_ai` 古风 AI 角色 profile 作为下一阶段素材与 AI 形象方向。
- `action_registry.config.json` 驱动的动作注册表。
- `states.config.json`、`motion_catalog.config.json`、`motion_sources.config.json` 驱动的动作与素材状态。
- 控制中心、profile 切换、任务、提醒、Codex 状态接入。
- 资产进度、动作台账、asset check、motion progress、透明视频处理 skill。

`V1.0.0` 不是功能终点，而是后续版本迭代的基准线。任何破坏当前默认 profile 可运行性、核心动作可播放性、资产校验链路和 source video 保留规则的改动，都应视为大风险改动。

## V1.1.0 AI/Agent 接入

`V1.1.0` 在基线之上新增本地 companion protocol：Electron main 提供 discovery/token、Unix socket NDJSON 协议、agent runtime 状态、message validator、reaction mapping、cooldown 和 stdio MCP adapter。它与现有 Codex 文件状态链路并行，不替换 `V1.0.0` 的运行方式。

## V1.1.2 鼠标靠近害羞交互

`V1.1.2` 将 `guofeng_ai` 的鼠标靠近反馈改为害羞状态：靠近身体播放正常到害羞，停留时进入害羞循环，移开后播放害羞到正常。三段素材以冻结的 `idle` 人物大小对齐，并通过多底色 QA 检查头、脚、发丝和水印区域。

## V1.1.3 鼠标害羞节奏加速

`V1.1.3` 不更换原始素材，只在透明 WebM 输出阶段加速鼠标害羞交互：进入和离开衔接态使用 `1.75x`，害羞循环使用 `1.5x`，让鼠标靠近反馈更轻快。

## V1.1.4 MCP 能力蓝图

`V1.1.4` 是规划态蓝图，不改变当前运行版本号。它把已完成的 MCP 遥控能力分层扩展为 agent 状态面板、用户确认流、事件/上下文摘要和 companion kernel 能力，为后续协议实施提供边界。

## V1.1.5 MCP Agent 状态面板

`V1.1.5` 实施 MCP L2 agent 状态面板：外部 agent 可以通过 `companion.agent.set_state/get_state/clear_state` 表达 working、testing、waiting_auth、blocked、done 等语义状态。该版本不新增视频素材，不启用 click/drag placeholder。

## V1.1.6 MCP 用户确认流

`V1.1.6` 实施 MCP L3 用户确认流：外部 agent 可以通过 `companion.confirm.request/get/cancel` 发起本地确认请求，控制中心展示 `允许 / 拒绝 / 取消`，桌宠进入 `waiting_auth`。该版本不做多选表单，不开放 MCP 伪造用户响应入口。

## V1.1.7 MCP 上下文摘要与视频台账

`V1.1.7` 实施 MCP L4 最小只读能力：外部 agent 可以通过 `companion.context.summary` 和 `companion.activity.list` 读取安全上下文摘要与最近活动记录。该版本同时新增 `docs/10_video_supply_progress.md`，把视频供给进度独立成台账，避免 V1.2 缺素材阻塞代码层推进。

## V1.1.8 Profile Capability Manifest

`V1.1.8` 实施 L5 最小 profile 能力声明：外部 agent 可以通过 `companion.profile.capabilities` 读取当前或指定 profile 的可用动作、缺 source 动作、视频阻塞项、MCP 层级和分发/开源预留边界。该版本不生成新视频，不把 click/drag placeholder 标记为 runtime ready。L4 事件流 `companion.events.subscribe` 明确尚未实现，后续单独推进。

## V1.1.9 MCP Permission Policy

`V1.1.9` 实施 L5 最小权限治理层：外部 agent 可以通过 `companion.permissions.summary` 读取 MCP 方法的风险分层、allow/deny 状态和确认要求。默认策略不阻断既有能力，只把 `readonly / display / agent_state / confirmation / profile_change` 边界配置化，为后续插件、偏好和 App Store/开源权限说明打基础。

## V1.2.0 用户交互动作补全

`V1.2.0` 补齐 `guofeng_ai` 的 click/drag 用户交互动作用于真实 runtime：点击头部触发 `click_head_happy`，点击身体触发 `click_body_confused`，拖拽链路使用 `drag_start_lift -> drag_hold_lift -> drag_end_dizzy`。两个拖动衔接态在透明 WebM 输出阶段使用 `2.0x` 加速，并按 `idle -> drag_start -> drag_hold -> drag_end -> idle` 的首尾帧实际大小和位置做链式对齐。

## V1.2.1 Codex 授权提示修复

`V1.2.1` 区分 Codex 自身 PermissionRequest 和 MCP confirmation：前者提示用户在 Codex 中确认授权，不生成控制中心卡片；后者仍由 `companion.confirm.request` 打开控制中心临时确认入口。Codex `waiting_auth` 增加 60 秒过期清理，避免重启后残留旧授权提示。

## V1.2.2 原生点击命中与拖动节奏

`V1.2.2` 使用 macOS 原生 input helper 精准拦截人物 alpha 区域内的普通左键，避免点击穿透到桌面；透明区域继续穿透。普通点击触发头部/身体反馈，Option 仅用于抓起拖动。`drag_start_lift` 提升为 `6.0x`，`mouse_leave_back` 暂时保留运行但标记为待替换素材。

## V1.2.3 头部实体命中校准

`V1.2.3` 为 `guofeng_ai` 增加 profile-scoped 点击区域配置：头部使用人物实体 bbox 顶部 `34%`，轮廓增加 `10px` 容差；动作切换时保留上一帧有效 regions，避免害羞切换瞬间头部不可点。拖动开始时不再播放起始衔接态，直接进入 `drag_hold_lift` 循环；释放后仍播放 `drag_end_dizzy` 收尾。

## V1.3.0 本地 Profile Package

`V1.3.0` 将角色从仓库内部配置升级为本地包：内置角色可导出为 `.companion-profile.zip`，控制中心可导入和移除非内置角色。包内 manifest 声明 runtime 配置、资产入口、QA summary、license/provenance、缺 source 动作和待替换视频。缺非核心视频只形成 warning，不生成占位素材；缺少 `idle` 或必需配置时禁止切换。

`V1.4.0` 新增声明式插件运行时：内置与本地插件只通过 JSON manifest 声明 interval、idle、condition trigger 和 speech、reaction、random action 展示反馈。Electron main 负责白名单校验、调度、cooldown、TTL、启停持久化与 activity 记录；renderer 只接收验证后的低优先级反馈。插件不执行任意脚本，不访问网络，不写入插件文件。

## 当前核心资产

- 默认 profile：`legacy_real`
- 新 profile：`guofeng_ai`
- 已完成基础动作：`idle`、`reading`、`coding`、`thinking`、`success`、`error`、`reminder`、`sleep`
- 已完成姿态动作：`duck_sit_idle`、`duck_sit_head_hair`、`duck_sit_finger_lip`、`duck_sit_stretch`
- 已完成桥接动作：`stand_to_duck_sit`、`duck_sit_to_stand`、`duck_sit_to_sleep`、`sleep_to_stand`
- 待补素材：站立到阅读/工作/思考的双向桥接，以及非 V1.2 主线的长期动作补充
- MCP 能力蓝图：`docs/09_mcp_capability_blueprint.md`
- 视频供给台账：`docs/10_video_supply_progress.md`
- profile 能力声明：`data/profiles/<profile>/profile_manifest.config.json`
- profile package 声明：`data/profiles/<profile>/profile_package.config.json`
- MCP 权限策略：`data/config/permission_policy.config.json`

## 文档索引

- `01_prd.md`：产品需求文档
- `02_roadmap.md`：版本规划
- `03_architecture.md`：技术架构
- `04_acceptance_checklist.md`：验收清单
- `05_ai_coding_agent_guide.md`：AI Coding Agent 工作协议
- `06_progress.md`：流程与进度记录
- `07_name_rule.md`：版本命名规范
- `08_decisions.md`：决策记录
- `09_mcp_capability_blueprint.md`：MCP 能力蓝图
- `10_video_supply_progress.md`：视频供给进度台账

## 生成资料

生成型进度文件统一放在 `docs/generated/`，不再与正式产品文档混放。
