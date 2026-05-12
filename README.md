# Desktop AI Companion

This repo is now organized around the current locked desktop companion runtime.

## Current Runtime

- Renderer: Electron + React.
- Runtime assets: `assets/webm/<state>/<state>_loop.webm`.
- PNG fallback assets: `assets/keyframes/<state>/<state>_01.png`.
- Source videos are preserved locally under `assets/states/<state>/source/`.
- Motion state config lives in `data/config/states.config.json`.
- Source-video metadata lives in `data/config/motion_sources.config.json`.
- Motion catalog and progress generation live in `data/config/motion_catalog.config.json` and `docs/pb3/action_progress.md`.

The current shipped states are locked. Do not regenerate or retune them unless we intentionally start a new asset pass.

## Useful Commands

```bash
npm install
npm run dev
npm run build
npm run asset:check:strict
python3 scripts/asset_check.py --strict --webm-strict
npm run motion:progress
```

## Source Video Workflow

For a new or replacement motion:

1. Put the original video in `assets/states/<state>/source/`.
2. Update `data/config/motion_sources.config.json` if the file name, provider, matte preset, or crop preset changed.
3. Run:

```bash
npm run motion:progress
python3 scripts/pb2_video_pipeline.py check --state <state>
python3 scripts/pb2_video_pipeline.py convert --state <state>
python3 scripts/asset_check.py --strict --webm-strict
```

The local skill `skills/white-bg-video-matting` is intentionally retained for future transparent-video work.

## Current Docs

- Current asset status: `docs/ASSET_STATUS.md`
- Generated video coverage table: `docs/pb3/action_progress.md`

Older PA/PB planning notes and historical QA sheets were removed after the current states were locked.
