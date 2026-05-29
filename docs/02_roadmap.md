# Roadmap

更新时间：2026-05-29  
当前冻结版本：`V1.0.0`

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

定位：第一个明确“接 AI”的版本。

目标：

- 建立本地 companion IPC/discovery 协议。
- 设计 MCP server 最小接口。
- 让桌宠被 agent 安全调用，而不是只显示状态文件。

交付物：

- 本地 discovery 文件或等效本地 endpoint。
- `companion.status`、`companion.react`、`companion.say`、`companion.profile.list`。
- reaction 到 action id 的映射表。
- message validator 与 cooldown。
- 协议 contract tests。
- 控制中心新增 Integrations/AI 接入状态区域的最小版本。

## V1.2.0：交互动作补齐

定位：让桌宠从“状态展示”进一步变成“会回应用户”。

目标：

- 补齐 P1-A hover/click/drag source videos。
- 完成 source -> keyframe -> WebM -> registry -> runtime 的闭环。
- 启用 `interaction_rules.config.json`。

交付物：

- `mouse_hover_look`
- `mouse_leave_back`
- `click_head_happy`
- `click_body_confused`
- `drag_start_lift`
- `drag_end_dizzy`

## V1.3.0：Profile Package

定位：把角色从内部目录升级为可导入、可预览、可校验的 profile package。

目标：

- 为 `legacy_real` 和 `guofeng_ai` 定义 package manifest。
- 包含 assets、action registry、states config、QA summary、license/provenance。
- 支持本地导入和 readiness 检查。

## V1.4.0：声明式插件

定位：提供安全可控的能力扩展。

目标：

- timer、random action、speech pool、condition trigger。
- 插件 manifest schema。
- 禁止默认开放任意 JS 执行。

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
