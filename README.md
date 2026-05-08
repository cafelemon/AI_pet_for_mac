# Desktop AI Companion

Desktop AI Companion is an independent desktop companion project planned around a high-definition character renderer, local state service, plugin integrations, and staged asset pipelines.

Current scaffold status:

- Base directories follow `desktop_ai_companion_roadmap_v_2.md`.
- PA0 keyframes are normalized transparent `1536x1728` PNG assets.
- PB1 supports optional transparent WebM loops from `assets/webm/` with PNG fallback.
- PB2 adds motion metadata, idle random actions, and a provider-aware source-video handoff.
- Original PA0 source photos are preserved under `assets/character/reference/pa0_raw/`.
- PA0 specs live in `docs/pa0/`.
- Asset validation starts from `scripts/asset_check.py`.

## Phase Order

```text
PA0 -> PA1 -> PA2 -> PA3 -> PA4 -> PA6 -> PA7 -> PB1 -> PB2
```

PA0 focuses on keyframe folders, naming rules, state action specs, and asset checks.

## PA3 Development

Run the transparent desktop companion with the PA3 Codex runtime state bridge:

```bash
npm install
npm run asset:check:strict
npm run dev
```

Build and type-check:

```bash
npm run build
```

PA3 opens a frameless `512x576` always-on-top Electron window and renders PA0 PNG keyframes from `assets/keyframes/` as a state catalog. It watches `~/.desktop-ai-companion/runtime_state/codex_state.json` and maps Codex runtime updates to `coding`, `thinking`, `waiting_auth`, `success`, `error`, and `idle`.

PA7 keeps the pet window fully mouse-through by default. Use `Command+Shift+Space` to open the independent Control Center near the cursor. With macOS input permissions granted, use `Option+Left Click` on the pet to drag it and `Option+Right Click` on the pet to open the Control Center. Legacy F2/F3/F4/F5 shortcuts are disabled by default and can be restored from Control Center settings.

PB1 upgrades the renderer to prefer transparent WebM loops at `assets/webm/<state>/<state>_loop.webm`. If a WebM asset is missing or fails to play, the renderer keeps showing the PNG fallback at `assets/keyframes/<state>/<state>_01.png`. `waiting_auth` continues to render through the `reminder` asset.

PB2 adds complete state-motion metadata and idle random small actions. Generate the white-background reference pack before producing source videos:

```bash
python3 scripts/prepare_pb2_keyframes.py
```

Place source videos under `assets/states/<state>/source/`, record provider and mask strategy in `data/config/motion_sources.config.json`, then convert them to transparent WebM when ffmpeg is available:

```bash
python3 scripts/pb2_video_pipeline.py check --skip-missing
python3 scripts/pb2_video_pipeline.py convert --state coding
```

Before WebM conversion, the renderer can use those local MP4 files as a white-background motion preview.

Track the full PB3 action pool and local video coverage:

```bash
npm run motion:progress
```

Validate the current PNG fallback set:

```bash
npm run asset:check:strict
```

When the full PB1 WebM set exists, validate it too:

```bash
python3 scripts/asset_check.py --strict --webm-strict
```

Preview the Codex hook installation without writing global config:

```bash
python3 scripts/install_codex_hooks.py --dry-run
```

Install hooks only when you are ready to update `~/.codex/hooks.json`:

```bash
python3 scripts/install_codex_hooks.py --install
```

Simulate runtime states without relying on live Codex hook coverage:

```bash
python3 scripts/simulate_codex_state.py --state coding --message "正在运行..." --task "PA3 smoke test"
python3 scripts/simulate_codex_state.py --state waiting_auth
python3 scripts/simulate_codex_state.py --state success --ttl-ms 4000
python3 scripts/simulate_codex_state.py --state error --ttl-ms 8000
python3 scripts/simulate_codex_state.py --state idle
```

`PostToolUse` success keeps the companion in `thinking`; final `Stop` is the only hook event that writes `success`.

## PA4 Development

PA4 adds a local SQLite reminder service at `data/sqlite/reminders.db`. The Electron main process scans due reminders, publishes the `reminder` state, and shows a reminder bubble.

The Control Center reminder module supports one-shot and daily/weekly/monthly repeating reminders, high/normal/low priority, local due-time entry, snoozing, and clearing scheduled reminders.

Smoke test an imminent reminder while the app is running:

```bash
python3 scripts/simulate_reminder.py --title "PA4 smoke" --due-seconds 5
```

## PA6 Development

PA6 skips PA5 weather until weather keyframes exist. It adds a local SQLite task center at `data/sqlite/tasks.db` with manual today tasks, Codex current task tracking, stuck-task reminders, and recent completion history.

Smoke test PA6 task rows while the app is running:

```bash
python3 scripts/simulate_task.py create --title "PA6 smoke task"
python3 scripts/simulate_task.py complete
python3 scripts/simulate_task.py stuck-codex --title "PA6 stuck smoke" --age-minutes 4
```
