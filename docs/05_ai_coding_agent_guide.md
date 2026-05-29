# AI Coding Agent Guide

更新时间：2026-05-29  
适用项目：Desktop AI Companion

## 项目一句话

这是一个本地桌面 AI 伙伴项目。当前优势是高质量透明视频动作资产和 profile 化桌宠运行时；下一阶段重点是接入 AI/Agent 协议层，让桌宠成为本地 companion kernel，而不是普通消息提醒 UI。

## 当前版本

- 当前冻结版本：`V1.0.0`
- npm 版本号：`1.0.0`
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

优先做 `V1.1.0`：

- 本地 discovery/token 或等效本地授权入口。
- `companion.status`
- `companion.react`
- `companion.say`
- `companion.profile.list`
- message validator
- cooldown
- contract tests

反应映射原则：

- `thinking` -> `thinking`
- `editing` / `coding` -> `coding`
- `waiting` -> `reminder` 或后续 `waiting_auth`
- `success` -> `success`
- `error` -> `error`

不要为了接入 OpenPets 或类似项目而降低当前 WebM/keyframe/QA 管线精度。兼容层应包在 profile package 或 protocol adapter 上。

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
