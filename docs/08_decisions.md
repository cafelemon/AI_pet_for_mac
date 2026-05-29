# Decision Log

更新时间：2026-05-29

## D001：冻结当前状态为 V1.0.0

决定：

当前 Desktop AI Companion 状态冻结为 `V1.0.0`，npm/package 版本同步为 `1.0.0`。

原因：

- 当前本地 runtime、动作 registry、profile 配置、任务/提醒、Codex 状态和素材校验已经形成可继续迭代的基线。
- 后续需要用明确版本语义管理功能迭代。

影响：

- 后续功能按 `MAJOR.MINOR.PATCH` 记录。
- 当前 runtime assets 和 source videos 按锁定基线处理。

## D002：长期差异化不是素材数量，而是 AI/Agent 内核

决定：

当前阶段可以承认素材质量和动作管线是明显优势，但未来产品定位要转向 AI/Agent companion kernel。

原因：

- 单纯素材数量容易被平台型竞品追平。
- 真正差异化来自桌宠能否成为 agent 状态、任务、上下文和用户节奏的本地表达层。
- 用户明确要求未来方向类似 OpenClaw 内核，而不是消息喇叭。

影响：

- `V1.1.0` 必须优先规划 AI/Agent 接入层。
- 文档中不再把“资产更多”写成长期核心壁垒。

## D003：短期不照搬 OpenPets monorepo

决定：

短期保持单 Electron app + Python asset scripts + profile config 结构。

原因：

- 当前项目最重的是素材处理、动作注册和本地运行时。
- MCP/client/CLI 尚未稳定，过早拆包会增加维护成本。

影响：

- 先实现协议 contract 和本地入口。
- 等 AI/Agent 接口稳定后，再评估 packages/client、packages/mcp、profile package 等拆分。

## D004：外部 agent 不直接写内部 runtime/config

决定：

外部 agent 未来统一通过 companion protocol 调用能力，不直接写 runtime state 或内部 config。

原因：

- 文件直写难以管理权限、安全、节流和兼容。
- protocol 层更适合 MCP、多 agent 和未来插件。

影响：

- `V1.1.0` 要设计 `status`、`react`、`say`、`profile.list` 等方法。
- 需要 message validator 和 contract tests。

## D005：气泡消息必须安全过滤

决定：

AI/Agent 接入后的 `say` 类能力必须经过安全校验和 cooldown。

原因：

- 桌宠气泡是桌面可见 UI，不应显示密钥、路径、URL、代码、日志堆栈或完整工具输出。

影响：

- `V1.1.0` 的验收包含 message validator。
- 控制中心可显示接入状态，但不直接暴露敏感内容。

## D006：为 App Store 与开源预留，但现在不进入发布工程

决定：

当前只做架构预留，不立即执行苹果商店上架或开源发布。

原因：

- 当前重点是产品基线和 AI/Agent 接入。
- 分发和开源需要素材版权、权限、隐私、签名、公证、包体和 license manifest 系统化准备。

影响：

- 新增 profile/package 时记录 license/provenance。
- 核心 runtime 与素材资产保持可拆分。
- 避免引入难以解释的权限和私有 API 依赖。
