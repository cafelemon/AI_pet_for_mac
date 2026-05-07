# Desktop AI Companion

Desktop AI Companion is an independent desktop companion project planned around a high-definition character renderer, local state service, plugin integrations, and staged asset pipelines.

Current scaffold status:

- Base directories follow `desktop_ai_companion_roadmap_v_2.md`.
- PA0 keyframes are normalized transparent `1536x1728` PNG assets.
- Original PA0 source photos are preserved under `assets/character/reference/pa0_raw/`.
- PA0 specs live in `docs/pa0/`.
- Asset validation starts from `scripts/asset_check.py`.

## Phase Order

```text
PA0 -> PA1 -> PA2 -> PA3
```

PA0 focuses on keyframe folders, naming rules, state action specs, and asset checks.

## PA1 Development

Run the transparent desktop companion MVP:

```bash
npm install
npm run asset:check:strict
npm run dev
```

Build and type-check:

```bash
npm run build
```

PA1 opens a frameless `512x576` always-on-top Electron window and renders PA0 PNG keyframes from `assets/keyframes/`. Use `ArrowRight` and `ArrowLeft` to cycle keyframes, and `Escape` to return to idle.
