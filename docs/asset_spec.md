# Asset Spec

See `docs/pa0/` for the PA0 keyframe naming rules, state action list, and layer strategy.

## PB1 WebM Loops

PB1 prefers transparent WebM loops when they are available and falls back to PA0 PNG keyframes when they are missing or fail to play.

- WebM loop path: `assets/webm/<state>/<state>_loop.webm`
- PNG fallback path: `assets/keyframes/<state>/<state>_01.png`
- Runtime states use `idle`, `coding`, `thinking`, `success`, `error`, `reminder`, and `sleep`.
- `waiting_auth` keeps using the `reminder` render asset until it gets a dedicated motion asset.
- Idle variants may use the same pattern: `assets/webm/idle_yawn/idle_yawn_loop.webm`.

Run `npm run asset:check:strict` to validate the existing PNG fallback set. Run `python3 scripts/asset_check.py --strict --webm-strict` only when every PB1 loop asset is expected to exist.

## PB2 Motion Source Assets

PB2 source videos are local handoff files from Jimeng, Kling, or another generator, and should live under:

```text
assets/states/<state>/source/
```

Record the source file name, provider, and watermark mask preset in `data/config/motion_sources.config.json`. The source directories are kept with `.gitkeep`, while raw source videos are ignored by git. Generate the reference pack with:

```bash
python3 scripts/prepare_pb2_keyframes.py
```

Convert source videos into runtime WebM assets with:

```bash
python3 scripts/pb2_video_pipeline.py convert --state <state>
```

See `docs/pb2/README.md` for the full PB2 handoff and QA workflow.
