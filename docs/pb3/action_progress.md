# Motion Action Progress

This table is generated from `data/config/motion_catalog.config.json` and local asset presence.

## Summary

- Total planned actions: 24
- WebM complete: 18
- Source videos ready, pending WebM conversion: 0
- Waiting for source videos: 6

## Progress Table

| Stage | Category | Action | Playback | Runtime wired | Provider | Mask preset | Matte preset | Crop preset | White keyframe | Source video | WebM | Status | Source path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PB1 | 原有核心 | `idle` (idle) | `loop` | yes | jimeng | `jimeng_corner` | `white` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/idle/source/idle_jimeng.mp4` |
| PB1 | 原有核心 | `coding` (coding) | `loop` | yes | jimeng | `jimeng_corner` | `white` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/coding/source/coding_jimeng.mp4` |
| PB1 | 原有核心 | `sleep` (sleep) | `loop` | yes | jianying | `none` | `sleep_props` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/sleep/source/jianying_sleep.mov` |
| PB2 | 原有核心 | `success` (success) | `one_shot` | yes | kling | `kling_corner` | `white` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/success/source/kling_success.mp4` |
| PB2 | 原有核心 | `error` (error) | `one_shot` | yes | kling | `kling_corner` | `white` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/error/source/error_jimeng.mp4` |
| PB2 | 原有核心 | `thinking` (thinking) | `loop` | yes | kling | `kling_corner` | `white` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/thinking/source/kling_thinking.mp4` |
| PB2 | 原有核心 | `reminder` (reminder) | `one_shot` | yes | jimeng | `jimeng_corner` | `white` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/reminder/source/reminder_jimeng.mp4` |
| PB3.1 | 待机小动作 | `idle_yawn` (yawn) | `one_shot` | yes | jimeng | `jimeng_corner` | `white` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/idle_yawn/source/idle_yawn_jimeng.mp4` |
| PB3.1 | 待机小动作 | `idle_hair` (hair) | `one_shot` | yes | jimeng | `jimeng_corner` | `neutral_floor` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/idle_hair/source/idle_hair_jimeng.mp4` |
| PB3.1 | 待机小动作 | `idle_reading` (reading) | `short_loop` | yes | jimeng | `jimeng_corner` | `neutral_floor` | `none` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/idle_reading/source/jimeng_reading.mp4` |
| Priority Idle V1 | 待机主姿态 | `duck_sit_idle` (duck sit idle) | `loop` | yes | kling | `none` | `neutral_floor` | `none` | no | yes | yes | 完成：WebM 已生成 | `assets/states/duck_sit_idle/source/kling_duck_sit_idle.mp4` |
| Priority Idle V1 | 鸭子坐待机小动作 | `duck_sit_head_hair` (duck sit hair) | `one_shot` | yes | jimeng | `none` | `neutral_floor` | `none` | no | yes | yes | 完成：WebM 已生成 | `assets/states/duck_sit_head_hair/source/duck_sit_head_hai r_jimeng.mp4` |
| Priority Idle V1 | 鸭子坐待机小动作 | `duck_sit_finger_lip` (duck sit finger lip) | `one_shot` | yes | kling | `none` | `neutral_floor` | `none` | no | yes | yes | 完成：WebM 已生成 | `assets/states/duck_sit_finger_lip/source/kling_duck_sit_finger_lip.mp4` |
| Priority Idle V1 | 鸭子坐待机小动作 | `duck_sit_stretch` (duck sit stretch) | `one_shot` | yes | kling | `none` | `neutral_floor` | `none` | no | yes | yes | 完成：WebM 已生成 | `assets/states/duck_sit_stretch/source/kling_duck_sit_stretch.mp4` |
| Priority Idle V1 | 姿态衔接 | `stand_to_duck_sit` (stand to duck sit) | `one_shot` | yes | kling | `none` | `neutral_floor` | `none` | no | yes | yes | 完成：WebM 已生成 | `assets/states/stand_to_duck_sit/source/kling_stand_to_duck_sit.mp4` |
| Priority Idle V1 | 姿态衔接 | `duck_sit_to_stand` (duck sit to stand) | `one_shot` | yes | kling | `none` | `neutral_floor` | `none` | no | yes | yes | 完成：WebM 已生成 | `assets/states/duck_sit_to_stand/source/kling_duck_sit_to_stand.mp4` |
| Priority Idle V1 | 姿态衔接 | `duck_sit_to_sleep` (duck sit to sleep) | `one_shot` | yes | jianying | `none` | `sleep_props` | `none` | no | yes | yes | 完成：WebM 已生成 | `assets/states/duck_sit_to_sleep/source/jianying_duck_sit_to_sleep.mov` |
| Priority Idle V1 | 姿态衔接 | `sleep_to_stand` (sleep to stand) | `one_shot` | yes | kling | `none` | `sleep_props` | `sleep_to_stand` | no | yes | yes | 完成：WebM 已生成 | `assets/states/sleep_to_stand/source/kling_sleep_to_stand.mp4` |
| Priority Idle V2 | 姿态衔接 | `stand_to_reading` (stand to reading) | `one_shot` | no | unknown | `none` | `neutral_floor` | `none` | no | no | no | 待补源视频 | `assets/states/stand_to_reading/source/stand_to_reading_source.mp4` |
| Priority Idle V2 | 姿态衔接 | `reading_to_stand` (reading to stand) | `one_shot` | no | unknown | `none` | `neutral_floor` | `none` | no | no | no | 待补源视频 | `assets/states/reading_to_stand/source/reading_to_stand_source.mp4` |
| Priority Idle V2 | 姿态衔接 | `stand_to_coding` (stand to coding) | `one_shot` | no | unknown | `none` | `neutral_floor` | `none` | no | no | no | 待补源视频 | `assets/states/stand_to_coding/source/stand_to_coding_source.mp4` |
| Priority Idle V2 | 姿态衔接 | `coding_to_stand` (coding to stand) | `one_shot` | no | unknown | `none` | `neutral_floor` | `none` | no | no | no | 待补源视频 | `assets/states/coding_to_stand/source/coding_to_stand_source.mp4` |
| Priority Idle V2 | 姿态衔接 | `stand_to_thinking` (stand to thinking) | `one_shot` | no | unknown | `none` | `neutral_floor` | `none` | no | no | no | 待补源视频 | `assets/states/stand_to_thinking/source/stand_to_thinking_source.mp4` |
| Priority Idle V2 | 姿态衔接 | `thinking_to_stand` (thinking to stand) | `one_shot` | no | unknown | `none` | `neutral_floor` | `none` | no | no | no | 待补源视频 | `assets/states/thinking_to_stand/source/thinking_to_stand_source.mp4` |

## Next Fill List

Provide new source videos using the exact source path shown in the table. If the video is not from the current provider, update `data/config/motion_sources.config.json` first. After a video arrives, run:

```bash
python3 scripts/update_motion_progress.py --ensure-dirs
python3 scripts/pb2_video_pipeline.py check --state <action>
python3 scripts/pb2_video_pipeline.py convert --state <action>
```

Full WebM validation should wait until all required runtime actions have WebM outputs:

```bash
python3 scripts/asset_check.py --strict --webm-strict
```
