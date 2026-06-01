# Desktop AI Companion Overview

更新时间：2026-05-31
当前版本：`V1.1.8`
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

## 当前核心资产

- 默认 profile：`legacy_real`
- 新 profile：`guofeng_ai`
- 已完成基础动作：`idle`、`reading`、`coding`、`thinking`、`success`、`error`、`reminder`、`sleep`
- 已完成姿态动作：`duck_sit_idle`、`duck_sit_head_hair`、`duck_sit_finger_lip`、`duck_sit_stretch`
- 已完成桥接动作：`stand_to_duck_sit`、`duck_sit_to_stand`、`duck_sit_to_sleep`、`sleep_to_stand`
- 待补素材：站立到阅读/工作/思考的双向桥接，以及 P1-A click/drag 用户交互动作为 source video
- MCP 能力蓝图：`docs/09_mcp_capability_blueprint.md`
- 视频供给台账：`docs/10_video_supply_progress.md`
- profile 能力声明：`data/profiles/<profile>/profile_manifest.config.json`

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
