# Desktop AI Companion Overview

更新时间：2026-05-29  
当前冻结版本：`V1.0.0`

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

## 当前核心资产

- 默认 profile：`legacy_real`
- 新 profile：`guofeng_ai`
- 已完成基础动作：`idle`、`reading`、`coding`、`thinking`、`success`、`error`、`reminder`、`sleep`
- 已完成姿态动作：`duck_sit_idle`、`duck_sit_head_hair`、`duck_sit_finger_lip`、`duck_sit_stretch`
- 已完成桥接动作：`stand_to_duck_sit`、`duck_sit_to_stand`、`duck_sit_to_sleep`、`sleep_to_stand`
- 待补素材：站立到阅读/工作/思考的双向桥接，以及 P1-A hover/click/drag 用户交互动作为 source video

## 文档索引

- `01_prd.md`：产品需求文档
- `02_roadmap.md`：版本规划
- `03_architecture.md`：技术架构
- `04_acceptance_checklist.md`：验收清单
- `05_ai_coding_agent_guide.md`：AI Coding Agent 工作协议
- `06_progress.md`：流程与进度记录
- `07_name_rule.md`：版本命名规范
- `08_decisions.md`：决策记录

## 生成资料

生成型进度文件统一放在 `docs/generated/`，不再与正式产品文档混放。
