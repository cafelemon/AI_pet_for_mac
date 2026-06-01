# Desktop AI Companion

当前项目版本为 `V1.1.8`。`V1.0.0` 冻结了现有本地桌宠运行时、真人桌宠素材包、古风 AI 角色素材框架、控制中心、任务/提醒/Codex 状态接入和资产校验链路；`V1.1.0` 新增本地 AI/Agent companion protocol，`V1.1.7` 新增安全上下文摘要、活动记录和视频供给台账，`V1.1.8` 新增 profile 能力声明。

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
npm run build
npm run asset:check:strict
python3 scripts/asset_check.py --strict --webm-strict
python3 scripts/pb2_video_pipeline.py check --skip-missing
npm run motion:progress
node scripts/companion_mcp_server.mjs
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

`V1.1.8` 之后，agent 可通过 `companion_profile_capabilities` 查询当前 profile 的 ready 能力、缺失视频动作和分发预留边界；L4 事件流 `companion.events.subscribe` 尚未实现，保留为后续 TODO。

Generated operational reports live under `docs/generated/` so the root docs folder stays focused on the current product plan.

## Source Video Workflow

For a new or replacement motion:

1. Put the original video in the exact `source/` path listed by the motion progress doc.
2. Update the matching `motion_sources.config.json` if the file name, provider, matte preset, or crop preset changed.
3. Run the progress generator and conversion checks.
4. Keep original source videos unless there is an explicit deletion decision.

The local skill `skills/white-bg-video-matting` is intentionally retained for future transparent-video work.
