# Priority Idle V1 MP4 Handoff

This project keeps the existing standing assets under their current runtime names:

| Plan name | Current project name |
|---|---|
| `standing_idle` | `idle` |
| `standing_hair` | `idle_hair` |
| `standing_reading` | `idle_reading` |
| `standing_yawn` | `idle_yawn` |
| `sleep` | `sleep` |

Use these exact paths for the new MP4 files:

| Priority | State | Expected MP4 path | Default matte |
|---|---|---|---|
| 1 | `duck_sit_idle` | `assets/states/duck_sit_idle/source/duck_sit_idle_source.mp4` | `neutral_floor` |
| 1 | `stand_to_duck_sit` | `assets/states/stand_to_duck_sit/source/stand_to_duck_sit_source.mp4` | `neutral_floor` |
| 1 | `duck_sit_to_stand` | `assets/states/duck_sit_to_stand/source/duck_sit_to_stand_source.mp4` | `neutral_floor` |
| 1 | `duck_sit_to_sleep` | `assets/states/duck_sit_to_sleep/source/duck_sit_to_sleep_source.mp4` | `white` |
| 2 | `duck_sit_head_hair` | `assets/states/duck_sit_head_hair/source/duck_sit_head_hair_source.mp4` | `neutral_floor` |
| 2 | `duck_sit_finger_lip` | `assets/states/duck_sit_finger_lip/source/duck_sit_finger_lip_source.mp4` | `neutral_floor` |
| 2 | `duck_sit_stretch` | `assets/states/duck_sit_stretch/source/duck_sit_stretch_source.mp4` | `neutral_floor` |

After an MP4 arrives:

```bash
python3 scripts/pb2_video_pipeline.py check --state <state>
python3 scripts/pb2_video_pipeline.py convert --state <state>
python3 scripts/update_motion_progress.py --ensure-dirs
```

QA outputs are written to:

```text
docs/pb2/qa/<state>_contact.png
docs/pb2/qa/magenta/<state>_magenta.png
docs/pb2/qa/alpha/<state>_alpha.png
```
