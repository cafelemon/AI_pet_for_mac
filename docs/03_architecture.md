# Architecture

更新时间：2026-06-02

## 当前架构

```mermaid
flowchart LR
  Codex["Codex runtime state"] --> Main["Electron main"]
  Agent["AI/Agent protocol"] --> Main
  Tasks["Tasks / reminders"] --> Main
  Config["data/config/*.json"] --> Main
  Main --> Renderer["React renderer"]
  Renderer --> Registry["Action registry"]
  Registry --> Assets["WebM + keyframe assets"]
  Profiles["pet_profiles.config.json"] --> Registry
  Plugins["Declarative plugin manifests"] --> Main
```

核心链路：

- Electron main 负责本地窗口、IPC、任务、提醒、Codex runtime state 和 AI/Agent protocol。
- React renderer 负责 companion UI、控制中心、状态面板和动作播放。
- `data/config/action_registry.config.json` 是默认 profile 的动作入口。
- `data/config/pet_profiles.config.json` 决定 profile 切换和每套配置位置。
- `scripts/*` 提供资产校验、motion progress、视频处理和运行时 contract check。
- `app/electron/declarativePlugins.ts` 负责声明式插件 manifest 校验、调度、节流、启停持久化和安全摘要。

## 声明式插件边界

- 内置目录：`data/plugins/*.plugin.json`。
- 本地目录：Electron `userData/plugins/*.plugin.json`。
- Renderer 只接收 `plugin:feedback`，并在 hover、click、drag 或高优先级状态冲突时拒绝或中断。
- Electron main 记录 `plugin_trigger / plugin_skip / plugin_error`，不把本机目录写入 summary。
- 插件没有 JS、shell、网络、动态模块、文件写入或业务写操作入口。

## 关键目录

- `app/electron/`：Electron main、preload、macOS 输入、任务、提醒。
- `app/renderer/`：React UI、companion、控制中心和样式。
- `app/shared/`：共享类型。
- `data/config/`：默认 profile 和全局配置。
- `data/profiles/guofeng_ai/`：古风 AI profile 配置。
- `assets/actions/`：默认真人桌宠动作资产。
- `assets/profiles/guofeng_ai/actions/`：古风 AI 角色动作资产。
- `docs/`：产品、架构、验收、进度和生成进度表。
- `scripts/`：资产、registry、profile 和 runtime 检查脚本。
- `skills/white-bg-video-matting/`：白底视频转透明 WebM 的本地工作流。

## V1.0.0 架构边界

冻结：

- 当前 registry/config 作为运行时权威来源。
- 当前 source video、WebM、keyframe 保留。
- 当前 profile 配置方式保留。
- 当前 Electron 单应用结构保留。

可演进：

- 新增 AI/Agent protocol 层。
- 新增 MCP server/client helper。
- 新增 Integrations 控制中心板块。
- 新增 profile package manifest。

不建议短期改动：

- 过早拆 monorepo。
- 开放任意 JS 插件。
- 为兼容外部宠物包牺牲当前 WebM + keyframe + QA 管线。
- 让 agent 直接写内部 runtime/config 文件。

## V1.1.0 架构

```mermaid
flowchart LR
  Agent["MCP agent / future clients"] --> MCP["stdio MCP adapter"]
  MCP --> Discovery["Local discovery + token"]
  Discovery --> Protocol["Unix socket NDJSON protocol"]
  Protocol --> Validator["Message validator + cooldown"]
  Validator --> Main["Electron main"]
  Main --> Renderer["React renderer"]
  Renderer --> ActionMap["Reaction -> action id"]
  ActionMap --> Registry["Action registry"]
  Registry --> Assets["Profile assets"]
```

协议层原则：

- 外部 agent 只接触公开 companion methods。
- 内部仍映射到现有 action registry。
- `say` 必须经过安全消息校验。
- `react` 只能触发允许的 action/reaction。
- `status` 可以暴露 readiness，但不泄露本地敏感路径。
- 控制中心只显示协议状态，不显示启动 token。

## V1.1.4 MCP 能力蓝图

`V1.1.4` 不改变架构实现，只补充后续能力分层：

- L1：当前已实现的 `status / react / say / profile.list / profile.select`。
- L2：agent 状态面板，将外部 agent 的工作、等待、阻塞、测试和完成状态映射到桌宠。
- L3：用户确认流，把授权、选择和确认请求变成可解释的本地交互。
- L4：事件订阅与上下文摘要，让 agent 少轮询、少直出日志。
- L5：companion kernel，包括 profile 能力、插件能力、权限和用户偏好。

详细边界见 `docs/09_mcp_capability_blueprint.md`。

## V1.1.5 Agent 状态面板

`V1.1.5` 在现有 protocol 层向后兼容增加 L2 agent state methods：

- `companion.agent.set_state`
- `companion.agent.get_state`
- `companion.agent.clear_state`

这些方法仍走本地 discovery、token、Unix socket 和 stdio MCP adapter，不新增远程服务。Renderer 继续复用 `AgentRenderState` 优先级层，控制中心通过 protocol status 观察当前 semantic status、runtime state 和 expiresAt。

## V1.1.6 用户确认流

`V1.1.6` 在 protocol 层新增 L3 confirmation methods：

- `companion.confirm.request`
- `companion.confirm.get`
- `companion.confirm.cancel`

确认请求仍使用本地 Unix socket + token + stdio MCP adapter。Electron main 只维护一个 pending confirmation，并通过 renderer IPC 接收用户的 `allow / deny / cancel` 响应；MCP 不提供用户响应入口，避免外部 agent 伪造授权。pending 时桌宠进入 `waiting_auth`，控制中心自动打开 `AI 接入` 面板展示确认卡片。

控制中心确认卡片是当前缺少专门确认动作和气泡交互时的临时 UI 承接层。后续动作素材和气泡确认组件补齐后，确认流的主入口应迁移到桌宠气泡，控制中心保留为状态观察和兜底入口。

## V1.1.7 上下文摘要与活动记录

`V1.1.7` 在 protocol 层新增 L4 最小只读 methods：

- `companion.context.summary`
- `companion.activity.list`

`context.summary` 返回安全摘要，只包含 app/profile readiness、agent state、confirmation summary、Codex state 摘要、methods 和视频阻塞摘要，不暴露 token、socket path、discovery path、绝对路径或长日志。`activity.list` 从 Electron main 的内存 ring buffer 读取最近活动，默认 20 条、最大 50 条，不落盘、不跨重启保留。

`companion.events.subscribe` 尚未实现；当前 L4 只有只读 summary/list，不提供 streaming event transport。

## V1.1.8 Profile 能力声明

`V1.1.8` 在 profile 配置层新增 `profileManifestPath`，并通过 local protocol 暴露：

- `companion.profile.capabilities`

manifest 由 `data/profiles/<profile>/profile_manifest.config.json` 维护，记录 profile stage、MCP 层级、ready interactions、missing source actions、video blocked actions、确认入口和分发/开源预留字段。`context.summary` 只返回精简 `profileCapabilitiesSummary`，完整能力需要单独调用 profile capabilities。返回内容只包含 action id 和相对文档引用，不暴露 token、socket path、discovery path、绝对路径或本地 cwd。

## V1.1.9 MCP 权限策略

`V1.1.9` 新增最小 permission policy 配置：

- `data/config/permission_policy.config.json`
- `companion.permissions.summary`

Electron main 在处理 local protocol method 前执行 allow/deny 检查。默认策略保持全部既有 method 可用，只把 method 分为 `readonly / display / agent_state / confirmation / profile_change`。当前 `requiresConfirmation` 只作为声明和未来强制确认预留，不做权限弹窗；若某 method 被配置为 disabled，protocol 返回 permission denied 并记录 activity。

## V1.2.0 用户交互动作

`V1.2.0` 在 `guofeng_ai` profile 内补齐 click/drag 动作资产与 runtime 规则：

- `click_head_happy` / `click_body_confused`：按透明命中区域的上半/下半点击分流。
- `drag_start_lift -> drag_hold_lift -> drag_end_dizzy`：拖拽上升沿、保持、释放三段链路。
- `drag_start_lift` 和 `drag_end_dizzy` 在 WebM 输出阶段使用 `speedFactor: 2.0`，不覆盖原始 source。
- 视频管线为拖动链路维护独立 layout preset，按首尾帧 alpha bbox 对齐实际人物大小和位置。

## V1.2.1 Codex 授权状态清理

Codex hook 的 `PermissionRequest` 与 MCP `companion.confirm.request` 都会映射为 `waiting_auth`，但响应入口不同：Codex 权限请求在 Codex 界面确认，不生成控制中心卡片；MCP confirmation 才通过 renderer IPC 展示控制中心临时确认卡片。Codex hook 会写入 60 秒 `expiresAt`，Electron main 也会清理旧格式中超过 60 秒的无 `expiresAt` `waiting_auth`。

## V1.2.2 原生点击捕获

macOS input helper 在 renderer 为当前 profile 显式开启 click capture 后，精准拦截人物 alpha 命中区域内的无修饰键左键点击，并通过 `interaction:click` 将窗口内坐标转发给 renderer。透明区域保持穿透；Option + 左键继续进入拖动链路；无点击规则的 profile 不开启捕获。DOM `onPointerDown` 仍作为非 macOS 或辅助功能未授权时的 fallback。

## V1.2.3 点击区域校准

`interaction_rules.config.json` 可声明 `hitZones.clickHeadMaxYRatio` 和 `hitZones.clickPaddingPx`。renderer 先基于人物 alpha regions 计算实体 bbox，再按相对 Y 比例区分头部和身体。切换动作时空 regions 不覆盖上一帧有效值，直到新 keyframe 完成 alpha region 构建。

拖动激活时 `interactionDragKeyframe` 优先于其他交互动作直接渲染 `drag_hold_lift`；renderer 不再派发 `drag_start_lift`。释放拖动后继续派发 `drag_end_dizzy`，保留落地收尾衔接。

## 数据与配置权威源

- 动作是否存在：`action_registry.config.json`
- 动作进度和 source path：`motion_catalog.config.json` + `motion_sources.config.json`
- 人工视频供给台账：`docs/10_video_supply_progress.md`
- 运行时状态与时长：`states.config.json`
- profile 列表与路径：`pet_profiles.config.json`
- profile 能力声明：`profile_manifest.config.json`
- MCP 权限策略：`permission_policy.config.json`
- 用户交互规则：`interaction_rules.config.json`
- plugin 开关：`plugins.config.json`

## V1.3.0 本地 Profile Package

`V1.3.0` 新增本地角色包层。内置 profile 仍从仓库配置读取；导入角色解压到 Electron `userData/profiles/<profileId>/`，并与内置角色合并展示。

- `scripts/profile_package.py` 使用 Python 标准库执行 export、inspect、validate 和 install。
- 包内 `profile.package.json` 只允许相对路径，声明配置入口、资产根目录、required action、QA summary、license/provenance 和视频 warning。
- 安装先解压到临时目录，通过校验后原子替换已安装同名角色。
- 内置角色不可覆盖、不可移除；缺少 `idle` 或必需配置的包不可激活。
- renderer 不接触本机绝对路径。已安装资产通过 `companion-asset:///__installed_profiles__/<profileId>/...` 受控命名空间读取。
- MCP 继续只暴露 profile list/select/capabilities，不提供导入、覆盖或移除入口。

## 分发与开源预留

技术上要逐步做到：

- 配置 schema 可校验。
- profile package 可独立声明 license、provenance、required actions 和 QA summary。
- macOS 权限、通知、辅助功能、文件访问、网络访问可枚举。
- 核心协议和素材包解耦，便于未来开源核心、闭源或独立授权素材。
