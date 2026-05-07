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
