# Asset Status

## Locked Runtime States

These states are the current runtime set. Their WebM, fallback keyframe, and source-video entries are treated as locked.

| State | Playback | Runtime role | Source video |
|---|---|---|---|
| `idle` | loop | standing idle | `assets/actions/states/idle/base/source/idle_jimeng.mp4` |
| `reading` | loop | reading main state | `assets/actions/states/reading/base/source/jimeng_reading.mp4` |
| `coding` | loop | work/coding state and normalized idle action | `assets/actions/states/coding/base/source/coding_jimeng.mp4` |
| `thinking` | loop | thinking state and normalized idle action | `assets/actions/states/thinking/base/source/kling_thinking.mp4` |
| `success` | one-shot | task completion | `assets/actions/events/success/source/kling_success.mp4` |
| `error` | one-shot | task failure | `assets/actions/events/error/source/error_jimeng.mp4` |
| `reminder` | one-shot | reminders and waiting-auth fallback | `assets/actions/events/reminder/source/reminder_jimeng.mp4` |
| `sleep` | loop | sleep | `assets/actions/states/sleep/base/source/jianying_sleep.mov` |
| `idle_yawn` | one-shot | standing idle action | `assets/actions/states/idle/yawn/source/idle_yawn_jimeng.mp4` |
| `idle_hair` | one-shot | standing idle action | `assets/actions/states/idle/hair/source/idle_hair_jimeng.mp4` |
| `duck_sit_idle` | loop | duck-sit idle posture | `assets/actions/states/duck_sit/idle/source/kling_duck_sit_idle.mp4` |
| `duck_sit_head_hair` | one-shot | duck-sit idle action | `assets/actions/states/duck_sit/head_hair/source/duck_sit_head_hai r_jimeng.mp4` |
| `duck_sit_finger_lip` | one-shot | duck-sit idle action | `assets/actions/states/duck_sit/finger_lip/source/kling_duck_sit_finger_lip.mp4` |
| `duck_sit_stretch` | one-shot | duck-sit idle action | `assets/actions/states/duck_sit/stretch/source/kling_duck_sit_stretch.mp4` |
| `stand_to_duck_sit` | one-shot | standing to duck-sit bridge | `assets/actions/transitions/stand_to_duck_sit/source/kling_stand_to_duck_sit.mp4` |
| `duck_sit_to_stand` | one-shot | duck-sit to standing bridge | `assets/actions/transitions/duck_sit_to_stand/source/kling_duck_sit_to_stand.mp4` |
| `duck_sit_to_sleep` | one-shot | duck-sit to sleep bridge | `assets/actions/transitions/duck_sit_to_sleep/source/jianying_duck_sit_to_sleep.mov` |
| `sleep_to_stand` | one-shot | wake bridge | `assets/actions/transitions/sleep_to_stand/source/kling_sleep_to_stand.mp4` |

Current sleep entry deliberately does not force yawn or stretch:

```text
standing -> stand_to_duck_sit -> duck_sit_to_sleep -> sleep
duck_sit -> duck_sit_to_sleep -> sleep
```

## Pending Bridge Folders

These folders are intentionally empty except for `.gitkeep` until new source videos arrive:

| State | Purpose | Source placeholder |
|---|---|---|
| `stand_to_reading` | standing to reading | `assets/actions/transitions/stand_to_reading/source/` |
| `reading_to_stand` | reading to standing | `assets/actions/transitions/reading_to_stand/source/` |
| `stand_to_coding` | standing to coding/work | `assets/actions/transitions/stand_to_coding/source/` |
| `coding_to_stand` | coding/work to standing | `assets/actions/transitions/coding_to_stand/source/` |
| `stand_to_thinking` | standing to thinking | `assets/actions/transitions/stand_to_thinking/source/` |
| `thinking_to_stand` | thinking to standing | `assets/actions/transitions/thinking_to_stand/source/` |

## Cleanup Policy

- Keep source videos, WebM, and fallback keyframes under `assets/actions/`.
- Keep `skills/white-bg-video-matting`; it remains part of the future video workflow.
- Keep only current WebM/keyframes and source videos in the repo workspace.
- Treat `runtime/`, `.matting_work/`, historical QA sheets, and old planning notes as disposable working evidence.
