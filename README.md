# Desktop AI Companion

当前项目版本为 `V1.4.0`。`V1.0.0` 冻结了现有本地桌宠运行时；`V1.2.x` 补齐并校准 `guofeng_ai` 用户交互；`V1.3.0` 新增本地 Profile Package；`V1.4.0` 新增安全可控的声明式插件运行时。

## Product Direction

Desktop AI Companion 不是单纯的消息提醒桌宠。当前阶段的明显优势是高质量透明视频资产、动作注册表和多 profile 管线；下一阶段的核心差异化要转向 AI/Agent 内核，让桌宠能够被 Codex、MCP-capable agent、未来 Claude/OpenCode 等工具安全调用，并逐步具备类似 OpenClaw 内核的状态理解、能力调度和可扩展协议。

## Runtime

- Renderer: Electron + React.
- Main app: `app/electron/`, `app/renderer/`, `app/shared/`.
- Runtime configs: `data/config/*.config.json`.
- Profile configs: `data/config/pet_profiles.config.json` and `data/profiles/<profile>/`.
- Runtime assets: `assets/actions/` and `assets/profiles/<profile>/actions/`.
- Current locked profile: `legacy_real`.
- In-progress profile: `guofeng_ai`.

## Useful Commands

```bash
npm install
npm run dev
npm run typecheck
npm run agent:contract
npm run profile:contract
npm run plugin:contract
npm run build
npm run asset:check:strict
python3 scripts/asset_check.py --strict --webm-strict
python3 scripts/pb2_video_pipeline.py check --skip-missing
npm run motion:progress
node scripts/companion_mcp_server.mjs
python3 scripts/profile_package.py export --profile guofeng_ai
python3 scripts/profile_package.py validate --package dist/profiles/guofeng_ai-1.3.0.companion-profile.zip
```

## Docs

- Project overview: `docs/00_overview.md`
- PRD: `docs/01_prd.md`
- Roadmap and version plan: `docs/02_roadmap.md`
- Architecture: `docs/03_architecture.md`
- Acceptance checklist: `docs/04_acceptance_checklist.md`
- AI coding agent guide: `docs/05_ai_coding_agent_guide.md`
- Process and progress log: `docs/06_progress.md`
- Version naming rule: `docs/07_name_rule.md`
- Decisions: `docs/08_decisions.md`
- MCP capability blueprint: `docs/09_mcp_capability_blueprint.md`
- Video supply progress: `docs/10_video_supply_progress.md`

`V1.2.0` 之后，`guofeng_ai` 已具备鼠标靠近害羞、点击头部、点击身体和拖拽 start/hold/end 交互；agent 仍可通过 `companion_permissions_summary` 查询 MCP 方法治理状态。L4 事件流 `companion.events.subscribe` 尚未实现，保留为后续 TODO。

普通左键点击人物即可触发头部/身体反馈；Option 只用于抓起拖动。拖动开始后直接进入 `drag_hold_lift` 循环，释放后保留 `drag_end_dizzy` 收尾。`mouse_leave_back` 当前临时可运行，但素材 QA 不合格，等待替换视频。

Generated operational reports live under `docs/generated/` so the root docs folder stays focused on the current product plan.

## Local Profile Packages

`V1.3.0` 使用 `<profileId>-<version>.companion-profile.zip` 作为本地角色包格式。控制中心可以导入和移除非内置角色；缺少非核心 source 视频时允许安装并显示 warning，缺少 `idle` 或必需配置时禁止切换。内置角色不会被导入包覆盖。

## Declarative Plugins

`V1.4.0` 扫描内置 `data/plugins/*.plugin.json` 和 Electron `userData/plugins/*.plugin.json`。插件只声明 trigger 与展示 effect；Electron main 负责校验、调度、节流和状态记录。当前不支持插件压缩包、远程下载、JS、shell、动态模块、网络请求或文件写入。

控制中心“插件”页可以启停插件并刷新本地目录。覆盖值持久化在 Electron `userData`，不会修改仓库 manifest。可用只读 MCP 工具为 `companion_plugins_summary`。

## Source Video Workflow

For a new or replacement motion:

1. Put the original video in the exact `source/` path listed by the motion progress doc.
2. Update the matching `motion_sources.config.json` if the file name, provider, matte preset, or crop preset changed.
3. Run the progress generator and conversion checks.
4. Keep original source videos unless there is an explicit deletion decision.

The local skill `skills/white-bg-video-matting` is intentionally retained for future transparent-video work.
