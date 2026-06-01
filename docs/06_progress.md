# Process And Progress

更新时间：2026-05-31

## 工作流程

1. 先确认任务属于文档、运行时、动作资产、profile、AI/Agent 接入、分发/开源预留中的哪一类。
2. 修改前检查当前文件和 `git status --short`。
3. 对动作/素材改动，同步 registry、motion catalog、motion sources、states config 和 progress docs。
4. 对 AI/Agent 接入改动，先写协议 contract，再接 Electron/renderer。
5. 对分发/开源相关改动，记录 license/provenance、权限和隐私影响。
6. 完成后运行与改动范围匹配的验证命令。
7. 更新进度和决策记录。

## 当前状态：V1.1.8

日期：2026-05-31

已完成：

- 冻结当前项目状态为 `V1.0.0`。
- 根 npm 版本号更新为 `1.0.0`。
- 整合 docs 架构。
- 明确 `MAJOR.MINOR.PATCH` 版本规则。
- 明确 `V1.1.0` 是首个 AI/Agent 接入版本。
- 明确未来差异化从资产表现升级为 companion kernel。
- 为 macOS/App Store、开源平台、profile package 和插件系统预留边界。
- `V1.1.0` 新增本地 Unix socket companion protocol。
- 新增 discovery 文件、启动 token、NDJSON request/response。
- 新增 `companion.status`、`companion.react`、`companion.say`、`companion.profile.list`、`companion.profile.select`。
- 新增 agent runtime 状态层、message validator、reaction mapping 和 cooldown。
- 新增 stdio MCP adapter 与 `npm run agent:contract`。
- 控制中心新增 `AI 接入` 面板。
- 完成 Codex MCP 注册联调：`companion_status` 可读取 app/profile/protocol 状态。
- 完成 Codex MCP 动作联调：`companion_say` 可显示短消息并触发 `success`，`companion_react` 可触发 `thinking`。
- 验证连续 `say/react` 会触发 1500ms cooldown，符合安全节流设计。
- `V1.1.2` 完成鼠标靠近害羞循环交互。
- `V1.1.3` 完成鼠标害羞交互节奏加速。
- `V1.1.4` 完成 MCP 能力蓝图，不改变当前运行版本。
- `V1.1.5` 完成 MCP Agent 状态面板。
- `V1.1.6` 完成 MCP 用户确认流。
- `V1.1.7` 完成视频供给台账和 MCP 上下文摘要。
- `V1.1.8` 完成 profile 能力声明和 MCP 查询入口。

## 当前待办

- 为 V1.2.0 继续生成 click/drag P1-A 高质量 AI 视频源。
- 源视频到位后运行 WebM/keyframe/QA 管线，并将 click/drag 动作标记 runtime ready。
- 手动验证 click/drag 交互。
- 继续梳理 profile package manifest 字段，`V1.1.8` 已先落地 profile capability manifest。
- 补齐 P1-A 用户交互 source videos。
- 继续推进 `guofeng_ai` profile 素材完整度。
- L4 `companion.events.subscribe` 尚未实现，后续单独推进；L5 已先落地最小 profile capability manifest。

## V1.1.2 过程记录

日期：2026-05-29
版本：V1.1.2
类型：PATCH / asset / runtime

已完成：

- `mouse_hover_look`、`mouse_shy_loop`、`mouse_leave_back` 三段鼠标靠近害羞动作接入。
- 三段素材从桌面古风素材目录复制到 `guofeng_ai` interaction assets。
- 视频管线新增 `guofeng_mouse_cursor` 遮罩和鼠标害羞动作的 idle 对齐 preset。
- Renderer 行为改为：靠近播放正常到害羞，停留进入害羞循环，移开播放害羞到正常。
- 多底色 QA 已生成，重点检查头脚和水印/光标区域。
- package 版本升到 `1.1.2`。

## V1.1.3 过程记录

日期：2026-05-30
版本：V1.1.3
类型：PATCH / asset / runtime

已完成：

- `mouse_hover_look` 和 `mouse_leave_back` 配置 `speedFactor: 1.75`。
- `mouse_shy_loop` 配置 `speedFactor: 1.5`。
- 视频管线支持在透明 WebM 输出阶段应用 `setpts=PTS/<speedFactor>,fps=24`。
- 三段动作重新生成 WebM、fallback keyframe、contact 和多底色 QA。
- `states.config.json` 中三段动作时长更新为 `2875ms / 3375ms / 2875ms`。
- package 版本升到 `1.1.3`。

## V1.1.4 过程记录

日期：2026-05-31
版本：V1.1.4 blueprint
类型：PATCH / docs / protocol

已完成：

- 新增 `docs/09_mcp_capability_blueprint.md`。
- 明确 L1 当前 MCP 能力已经完成，L2-L5 作为后续规划。
- 明确 `V1.1.3` 继续作为当前运行版本，`V1.1.4` 不改 package 版本。
- 明确 click/drag 缺素材动作继续留在 `V1.2.0`，不标记 runtime ready。
- 明确后续新增 MCP 方法前需要同步 protocol、adapter、contract check 和 Codex MCP smoke test。

## V1.1.5 过程记录

日期：2026-05-31
版本：V1.1.5
类型：PATCH / protocol / runtime

已完成：

- 新增 `companion.agent.set_state`、`companion.agent.get_state`、`companion.agent.clear_state`。
- 新增 `companion_agent_set_state`、`companion_agent_get_state`、`companion_agent_clear_state` MCP tools。
- 支持 `working / testing / waiting_auth / blocked / done / idle` 语义状态。
- 控制中心 AI 接入面板展示 semantic status、runtime state 和 expiresAt。
- contract check 覆盖 agent status mapping 和 MCP adapter tools。
- package 版本升到 `1.1.5`。

## V1.1.6 过程记录

日期：2026-05-31
版本：V1.1.6
类型：PATCH / protocol / runtime

已完成：

- 新增 `companion.confirm.request`、`companion.confirm.get`、`companion.confirm.cancel`。
- 新增 `companion_confirm_request`、`companion_confirm_get`、`companion_confirm_cancel` MCP tools。
- 控制中心 AI 接入面板展示 confirmation 卡片和 `允许 / 拒绝 / 取消`。
- pending confirmation 自动打开控制中心并使桌宠进入 `waiting_auth`。
- 用户响应只通过 renderer IPC 完成，MCP 不暴露 respond 方法。
- 记录当前控制中心确认卡片只是临时 UI；后续补齐专门动作和气泡后，确认入口迁移到桌宠气泡。
- package 版本升到 `1.1.6`。

## V1.1.7 过程记录

日期：2026-05-31
版本：V1.1.7
类型：PATCH / protocol / docs

已完成：

- 新增 `docs/10_video_supply_progress.md`，单独记录视频供给进度。
- 新增 `companion.context.summary` 和 `companion.activity.list`。
- 新增 `companion_context_summary` 和 `companion_activity_list` MCP tools。
- Electron main 新增内存 ring buffer 记录最近 companion 活动。
- `context.summary` 避免暴露 token、socket path、discovery path、绝对路径和长日志。
- package 版本升到 `1.1.7`。

## V1.1.8 过程记录

日期：2026-05-31
版本：V1.1.8
类型：PATCH / protocol / docs

已完成：

- 新增 `profile_manifest.config.json`，分别覆盖 `guofeng_ai` 与 `legacy_real`。
- `guofeng_ai` 明确标记鼠标害羞链路和 `drag_hold_lift` 已 ready，四个 click/drag P0 动作缺 source。
- `legacy_real` 使用保守能力声明，不继承古风 profile 交互。
- 新增 `companion.profile.capabilities` 和 `companion_profile_capabilities`。
- `context.summary` 增加 `profileCapabilitiesSummary`。
- 文档明确 L4 `companion.events.subscribe` 尚未实现。
- package 版本升到 `1.1.8`。

## V1.2.0 过程记录

日期：2026-05-29
版本：V1.2.0 in progress
类型：MINOR / asset / runtime

已完成：

- 新增 `guofeng_ai` profile-scoped interaction rules。
- Renderer 新增 profile-scoped interaction 调度底座；hover/leave 已在 `V1.1.2` 形成完整链路，并在 `V1.1.3` 调整节奏。
- 拖拽保持继续复用已完成的 `drag_hold_lift`。
- 为 P1-A click/drag 动作记录高质量 AI 视频生成提示词、源视频路径和转换命令。
- `npm run typecheck`、`npm run agent:contract`、`python3 scripts/pb2_video_pipeline.py check --profile guofeng_ai --skip-missing`、`python3 scripts/asset_check.py --profile guofeng_ai --strict --webm-strict` 已通过。

风险：

- click/drag source videos 尚未完整生成。
- P1-A 动作仍不可标记为完整 runtime ready，package 版本暂不升到 `1.2.0`。

## 过程记录模板

```text
日期：
版本：
类型：MAJOR / MINOR / PATCH / docs / asset / protocol
改动：
影响范围：
验证：
风险：
后续：
```

## 下一次推荐切入

建议下一步在不等视频的前提下继续推进插件/权限/偏好等 companion kernel 能力；L4 `companion.events.subscribe` 仍作为单独 TODO 保留。视频素材到位后再回到 `V1.2.0` click/drag 补齐。
