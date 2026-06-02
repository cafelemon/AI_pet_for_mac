# MCP Capability Blueprint

更新时间：2026-06-01
规划版本：`V1.1.4`
当前运行版本：`V1.4.0`

## 定位

`V1.1.4` 是 MCP/Agent 能力蓝图，不是新的 runtime 发布版本；`V1.1.5` 已实施 L2 agent 状态面板，`V1.1.6` 已实施 L3 用户确认流最小闭环，`V1.1.7` 已实施 L4 最小只读上下文能力，`V1.1.8` 已实施 L5 最小 profile 能力声明，`V1.1.9` 已实施 L5 最小 permission policy，`V1.2.0` 已补齐 `guofeng_ai` click/drag 用户交互动作。

这份蓝图的目标是把桌宠从“可被 agent 调用的遥控层”推进为“能表达 agent 状态、确认流和上下文的本地 companion runtime”。在真正新增 MCP 方法前，先明确能力层级、边界、风险和验收口径。

## 当前能力基线

已完成的 L1 能力：

- `companion.status`：读取 app/profile/protocol/状态信息。
- `companion.react`：触发白名单 reaction。
- `companion.say`：显示经过安全校验的短消息。
- `companion.profile.list`：列出 profile readiness。
- `companion.profile.select`：按 readiness 规则切换 profile。
- stdio MCP adapter：`node scripts/companion_mcp_server.mjs`。
- 本地 discovery + token + Unix socket NDJSON protocol。
- cooldown、message validator、Codex MCP 实机 smoke test。

L1 的产品意义是“agent 可以安全调用桌宠”。它还不是完整 companion kernel。

`V1.1.5` 已实施 L2 agent 状态面板，`V1.1.6` 已实施 L3 用户确认流最小闭环，`V1.1.7` 已实施 L4 上下文摘要与活动记录，`V1.1.8` 已实施 L5 profile capability manifest，`V1.1.9` 已实施 L5 permission policy，`V1.2.0` 已完成用户交互动作补齐。

## 能力分层

### L2 Agent 状态面板

目标：让桌宠准确表达 agent 当前处境，而不是只显示一句消息。

已实施能力：

- `companion.agent.set_state`：设置 `working / waiting_auth / blocked / testing / done / idle` 等状态。
- `companion.agent.clear_state`：清除 agent 状态，回到 Codex/task/reminder 等原优先级。
- `companion.agent.get_state`：读取当前 agent 状态、来源、ttl 和摘要。

验收口径：

- 状态有明确 TTL，不长期占用桌宠。
- 不覆盖 task/reminder 等更高优先级。
- 状态文案不允许包含密钥、路径、URL、堆栈和长日志。

### L3 用户确认流

目标：让 agent 在需要授权、选择或确认时，可以通过桌宠发起一个可解释的本地确认请求。

已实施能力：

- `companion.confirm.request`：创建确认请求，包含短标题、简短说明和过期时间。
- `companion.confirm.get`：读取当前或最近一次确认请求和状态。
- `companion.confirm.cancel`：agent 取消 pending confirmation。
- 用户 `allow / deny / cancel` 响应只通过控制中心 renderer IPC 写入。
- 当前控制中心确认卡片是临时 UI；后续补齐专门确认动作和气泡组件后，主交互入口迁移到桌宠气泡。

验收口径：

- 默认只支持本地确认，不做远程确认。
- 确认请求必须可过期、可取消、可解释。
- 高风险操作只展示摘要，不把完整命令或敏感内容写入气泡。
- MCP 不暴露 respond 方法，避免 agent 伪造用户授权结果。
- 控制中心可以作为状态观察和兜底入口，但不应被视为最终 companion 交互形态。

### L4 事件订阅与上下文摘要

目标：让外部 agent 能获取桌宠侧事件与轻量上下文，而不是持续轮询。

已实施能力：

- `companion.context.summary`：返回当前 profile readiness、agent state、confirmation、Codex 摘要、methods 和视频阻塞摘要。
- `companion.activity.list`：返回最近有限条本地 companion 活动记录。

候选能力：

- `companion.events.subscribe`：规划为后续事件流，不在 `V1.1.7`、`V1.1.8` 或 `V1.1.9` 实现。

验收口径：

- 不输出 token、socket path、discovery path、绝对素材路径和用户私密日志。
- 活动记录有长度上限和敏感信息过滤。
- 当前活动记录只使用内存 ring buffer，不落盘。
- 事件流默认本地化，不引入公网服务。

### L5 Companion Kernel

目标：形成可扩展的本地 companion runtime，支持 profile 能力声明、插件能力、权限和长期偏好。

已实施能力：

- `companion.profile.capabilities`：返回当前或指定 profile 的安全能力声明。
- `companion_profile_capabilities`：stdio MCP tool。
- `profile_manifest.config.json`：记录 profile stage、MCP 层级、ready/missing/blocked actions、确认入口和分发预留。
- `companion.permissions.summary`：返回 MCP 方法风险分层、allow/deny 状态和确认要求。
- `companion_permissions_summary`：stdio MCP tool。
- `permission_policy.config.json`：声明 method group、allowed、requiresConfirmation 和说明。
- `companion.plugins.summary`：返回安全的声明式插件摘要。
- `companion_plugins_summary`：stdio MCP tool。
- `data/plugins/*.plugin.json`：声明式展示插件 manifest。

候选方向：

- Preference store：记录用户偏好的打扰程度、展示风格、默认 profile 和确认策略。

验收口径：

- 能力声明先走配置和文档，不默认开放任意脚本执行。
- 用户偏好可查看、可关闭、可重置。
- 为开源和 App Store 预留权限解释与 license/provenance 边界。

## 实施顺序建议

1. 已完成 L2：补齐 agent 状态面板，使 MCP 不只是 `say/react`。
2. 已完成 L3 最小闭环：确认流把桌宠从提示 UI 推进为本地 companion 授权入口。
3. 已完成 L4 最小只读能力：上下文摘要和活动列表减少轮询，并服务多 agent。
4. 已完成 L5 最小 profile 能力声明：先让 agent 读懂 profile 能力边界。
5. 已完成 L5 最小 permission policy：先让 agent 读懂和遵守当前 method 治理边界。
6. 后续继续做 L4 事件流或 L5 插件/偏好，不与 V1.2 视频素材互相阻塞。

## 当前不做

- 不生成或替换视频素材。
- 不把 click/drag placeholder 标记为 runtime ready。
- 不新增远程 HTTP、公网服务或后台云依赖。
- 不引入 MCP SDK 依赖。
- 不改变当前 `companion.status/react/say/profile.*` 的兼容行为。

## 后续实施门槛

任何新增 MCP 方法都需要：

- 更新本地 protocol methods 和 stdio MCP adapter tools。
- 更新 contract check。
- 通过 Codex MCP 实机 smoke test。
- 在控制中心中保持可观察状态。
- 明确安全校验、TTL、cooldown 或确认策略。
- 更新 roadmap、progress、decisions 和 agent guide。
