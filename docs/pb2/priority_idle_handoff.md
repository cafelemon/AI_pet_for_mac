# Priority Idle V1 MP4 Handoff

This project keeps the existing standing assets under their current runtime names:

| Plan name | Current project name |
|---|---|
| `standing_idle` | `idle` |
| `standing_hair` | `idle_hair` |
| `standing_reading` | `idle_reading` |
| `standing_yawn` | `idle_yawn` |
| `sleep` | `sleep` |

Current source files and conversion settings:

| Priority | State | MP4 path | Matte | Crop |
|---|---|---|---|---|
| 1 | `sleep` | `assets/states/sleep/source/kling_sleep.mp4` | `sleep_props` | `none` |
| 1 | `duck_sit_idle` | `assets/states/duck_sit_idle/source/kling_duck_sit_idle.mp4` | `neutral_floor` | `none` |
| 1 | `stand_to_duck_sit` | `assets/states/stand_to_duck_sit/source/kling_stand_to_duck_sit.mp4` | `neutral_floor` | `none` |
| 1 | `duck_sit_to_stand` | `assets/states/duck_sit_to_stand/source/kling_duck_sit_to_stand.mp4` | `neutral_floor` | `none` |
| 1 | `duck_sit_to_sleep` | `assets/states/duck_sit_to_sleep/source/kling_duck_sit_to_sleep.mp4` | `sleep_props` | `duck_sit_to_sleep` |
| 1 | `sleep_to_stand` | `assets/states/sleep_to_stand/source/kling_sleep_to_stand.mp4` | `sleep_props` | `sleep_to_stand` |
| 2 | `duck_sit_head_hair` | `assets/states/duck_sit_head_hair/source/duck_sit_head_hai r_jimeng.mp4` | `neutral_floor` | `none` |
| 2 | `duck_sit_finger_lip` | `assets/states/duck_sit_finger_lip/source/kling_duck_sit_finger_lip.mp4` | `neutral_floor` | `none` |
| 2 | `duck_sit_stretch` | `assets/states/duck_sit_stretch/source/kling_duck_sit_stretch.mp4` | `neutral_floor` | `none` |

Runtime wake-up rule:

```text
sleep
  ↓
sleep_to_stand
  ↓
idle / standing_idle
```

When sleep ends for any reason, the renderer must play `sleep_to_stand` before showing any standing, duck-sit, task, or reminder state.

Sleep video QA rule:

- `sleep`, `duck_sit_to_sleep`, and `sleep_to_stand` use `sleep_props` to preserve the cup/soft cushion, shoes, and character.
- `duck_sit_to_sleep` and `sleep_to_stand` are cropped before matte generation to remove 16:9 black side bars.
- These states must be checked on magenta, black, and gray backgrounds before delivery.

After an MP4 changes:

```bash
python3 scripts/pb2_video_pipeline.py check --state <state>
python3 scripts/pb2_video_pipeline.py convert --state <state>
python3 scripts/update_motion_progress.py --ensure-dirs
```

QA outputs are written to:

```text
docs/pb2/qa/<state>_contact.png
docs/pb2/qa/magenta/<state>_magenta.png
docs/pb2/qa/black/<state>_black.png
docs/pb2/qa/gray/<state>_gray.png
docs/pb2/qa/alpha/<state>_alpha.png
```
