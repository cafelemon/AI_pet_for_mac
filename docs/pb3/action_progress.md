# PB3 Action Progress

This table is generated from `data/config/motion_catalog.config.json` and local asset presence.

## Summary

- Total planned actions: 32
- WebM complete: 10
- Source videos ready, pending WebM conversion: 0
- Waiting for source videos: 22

## Progress Table

| Stage | Category | Action | Playback | Runtime wired | Provider | Mask preset | Matte preset | White keyframe | Source video | WebM | Status | Source path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PB1 | 原有核心 | `idle` (idle) | `loop` | yes | jimeng | `jimeng_corner` | `white` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/idle/source/idle_jimeng.mp4` |
| PB1 | 原有核心 | `coding` (coding) | `loop` | yes | jimeng | `jimeng_corner` | `white` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/coding/source/coding_jimeng.mp4` |
| PB1 | 原有核心 | `sleep` (sleep) | `loop` | yes | kling | `kling_corner` | `white` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/sleep/source/sleep_jimeng.mp4` |
| PB2 | 原有核心 | `success` (success) | `one_shot` | yes | kling | `kling_corner` | `white` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/success/source/kling_success.mp4` |
| PB2 | 原有核心 | `error` (error) | `one_shot` | yes | kling | `kling_corner` | `white` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/error/source/error_jimeng.mp4` |
| PB2 | 原有核心 | `thinking` (thinking) | `loop` | yes | kling | `kling_corner` | `white` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/thinking/source/thinking_jimeng.mp4` |
| PB2 | 原有核心 | `reminder` (reminder) | `one_shot` | yes | jimeng | `jimeng_corner` | `white` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/reminder/source/reminder_jimeng.mp4` |
| PB3.1 | 待机小动作 | `idle_yawn` (yawn) | `one_shot` | yes | jimeng | `jimeng_corner` | `white` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/idle_yawn/source/idle_yawn_jimeng.mp4` |
| PB3.1 | 待机小动作 | `idle_hair` (hair) | `one_shot` | yes | jimeng | `jimeng_corner` | `neutral_floor` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/idle_hair/source/idle_hair_jimeng.mp4` |
| PB3.1 | 待机小动作 | `idle_reading` (reading) | `short_loop` | yes | jimeng | `jimeng_corner` | `neutral_floor` | yes | yes | yes | 完成：WebM 已生成 | `assets/states/idle_reading/source/idle_reading_jimeng.mp4` |
| Priority Idle V1 | 待机主姿态 | `duck_sit_idle` (duck sit idle) | `loop` | no | unknown | `none` | `neutral_floor` | no | no | no | 待补源视频 | `assets/states/duck_sit_idle/source/duck_sit_idle_source.mp4` |
| Priority Idle V1 | 鸭子坐待机小动作 | `duck_sit_head_hair` (duck sit hair) | `one_shot` | no | unknown | `none` | `neutral_floor` | no | no | no | 待补源视频 | `assets/states/duck_sit_head_hair/source/duck_sit_head_hair_source.mp4` |
| Priority Idle V1 | 鸭子坐待机小动作 | `duck_sit_finger_lip` (duck sit finger lip) | `one_shot` | no | unknown | `none` | `neutral_floor` | no | no | no | 待补源视频 | `assets/states/duck_sit_finger_lip/source/duck_sit_finger_lip_source.mp4` |
| Priority Idle V1 | 鸭子坐待机小动作 | `duck_sit_stretch` (duck sit stretch) | `one_shot` | no | unknown | `none` | `neutral_floor` | no | no | no | 待补源视频 | `assets/states/duck_sit_stretch/source/duck_sit_stretch_source.mp4` |
| Priority Idle V1 | 姿态衔接 | `stand_to_duck_sit` (stand to duck sit) | `one_shot` | no | unknown | `none` | `neutral_floor` | no | no | no | 待补源视频 | `assets/states/stand_to_duck_sit/source/stand_to_duck_sit_source.mp4` |
| Priority Idle V1 | 姿态衔接 | `duck_sit_to_stand` (duck sit to stand) | `one_shot` | no | unknown | `none` | `neutral_floor` | no | no | no | 待补源视频 | `assets/states/duck_sit_to_stand/source/duck_sit_to_stand_source.mp4` |
| Priority Idle V1 | 姿态衔接 | `duck_sit_to_sleep` (duck sit to sleep) | `one_shot` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/duck_sit_to_sleep/source/duck_sit_to_sleep_source.mp4` |
| PB3.1 | 待机小动作 | `bored` (bored) | `loop` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/bored/source/bored_source.mp4` |
| PB3.1 | 生活互动 | `stretch` (stretch) | `one_shot` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/stretch/source/stretch_source.mp4` |
| PB3.1 | 生活互动 | `drink` (drink) | `short_loop` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/drink/source/drink_source.mp4` |
| PB3.1 | 趣味互动 | `hide` (hide) | `one_shot` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/hide/source/hide_source.mp4` |
| PB2 | 启动互动 | `wave` (wave) | `one_shot` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/wave/source/wave_source.mp4` |
| PB3.2 | 任务过渡 | `loading` (loading) | `loop` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/loading/source/loading_source.mp4` |
| PB3.2 | 任务过渡 | `search` (search) | `short_loop` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/search/source/search_source.mp4` |
| PB3.2 | 任务过渡 | `explain` (explain) | `short_loop` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/explain/source/explain_source.mp4` |
| PB3.2 | 系统状态 | `update` (update) | `loop` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/update/source/update_source.mp4` |
| PB3.3 | 情绪反馈 | `shy` (shy) | `one_shot` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/shy/source/shy_source.mp4` |
| PB3.3 | 情绪反馈 | `angry` (angry) | `one_shot` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/angry/source/angry_source.mp4` |
| PB3.3 | 情绪反馈 | `cheer` (cheer) | `one_shot` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/cheer/source/cheer_source.mp4` |
| PB3.3 | 情绪反馈 | `confused` (confused) | `short_loop` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/confused/source/confused_source.mp4` |
| PB3.3 | 退出状态 | `bye` (bye) | `one_shot` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/bye/source/bye_source.mp4` |
| PB3.3 | 情绪增强 | `happy` (happy) | `short_loop` | no | unknown | `none` | `white` | no | no | no | 待补源视频 | `assets/states/happy/source/happy_source.mp4` |

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
