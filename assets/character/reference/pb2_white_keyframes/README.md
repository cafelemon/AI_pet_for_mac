# PB2 White Keyframe Pack

这些文件用于即梦生成 PB2 短视频。每个状态目录内的 `*_start.png` 是首帧参考，需要回到自然姿态的动作会额外提供 `*_end.png`。

生成视频后，把文件放到对应目录：

```text
assets/states/<state>/source/<state>_jimeng.mp4
```

统一要求：纯白背景、固定镜头、主体完整、无阴影、无水印、无字幕、3-5 秒。

| State | Playback | Source video |
|---|---|---|
| `idle` | `loop` | `assets/states/idle/source/idle_jimeng.mp4` |
| `idle_yawn` | `one_shot` | `assets/states/idle_yawn/source/idle_yawn_jimeng.mp4` |
| `idle_hair` | `one_shot` | `assets/states/idle_hair/source/idle_hair_jimeng.mp4` |
| `idle_reading` | `loop` | `assets/states/idle_reading/source/idle_reading_jimeng.mp4` |
| `coding` | `loop` | `assets/states/coding/source/coding_jimeng.mp4` |
| `thinking` | `loop` | `assets/states/thinking/source/thinking_jimeng.mp4` |
| `error` | `loop` | `assets/states/error/source/error_jimeng.mp4` |
| `success` | `one_shot` | `assets/states/success/source/success_jimeng.mp4` |
| `sleep` | `loop` | `assets/states/sleep/source/sleep_jimeng.mp4` |
| `reminder` | `loop` | `assets/states/reminder/source/reminder_jimeng.mp4` |
