# Video Supply Progress

更新时间：2026-05-31
适用版本：`V1.1.8`

这份文档是人工维护的视频供给台账，用来回答“缺什么视频、已经有哪些视频、下一批应该先给什么”。自动生成明细仍以 `docs/generated/profiles/guofeng_ai/action_progress.md` 为准；本文件只记录决策层优先级和交付状态。

`V1.1.8` 起，profile 能力声明会引用本台账作为视频缺口来源；缺 source 的动作只标记为 `missingSource/videoBlocked`，不生成占位、不标记 runtime ready。

## 当前结论

- 当前不因为视频缺失阻塞 `V1.1.x` 代码层推进。
- `V1.2.0` 继续保留给 click/drag 交互动作补齐。
- 空视频、占位路径、仅有 registry 配置都不能算完成，也不能标记 runtime ready。
- 新视频到位后先进入 source path，再跑 check/convert/QA，不直接改 runtime ready。

## V1.2.0 必补视频

| Profile | Priority | Action | Status | Runtime ready | Source path | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `guofeng_ai` | P0 | `click_head_happy` | 缺 source | no | `assets/profiles/guofeng_ai/actions/interactions/click_head_happy/source/click_head_happy_source.mp4` | 点击头部开心反馈 |
| `guofeng_ai` | P0 | `click_body_confused` | 缺 source | no | `assets/profiles/guofeng_ai/actions/interactions/click_body_confused/source/click_body_confused_source.mp4` | 点击身体困惑反馈 |
| `guofeng_ai` | P0 | `drag_start_lift` | 缺 source | no | `assets/profiles/guofeng_ai/actions/interactions/drag_start_lift/source/drag_start_lift_source.mp4` | 抓起起始衔接，需接 `drag_hold_lift` |
| `guofeng_ai` | P0 | `drag_end_dizzy` | 缺 source | no | `assets/profiles/guofeng_ai/actions/interactions/drag_end_dizzy/source/drag_end_dizzy_source.mp4` | 放下结束衔接，需回 idle |

## 已有交互视频

| Profile | Action | Status | Runtime ready | Source path | Notes |
| --- | --- | --- | --- | --- | --- |
| `guofeng_ai` | `mouse_hover_look` | source/WebM/keyframe/QA 已完成 | yes | `assets/profiles/guofeng_ai/actions/interactions/mouse_hover_look/source/mouse_hover_look_source.mp4` | 鼠标靠近进入害羞 |
| `guofeng_ai` | `mouse_shy_loop` | source/WebM/keyframe/QA 已完成 | yes | `assets/profiles/guofeng_ai/actions/interactions/mouse_shy_loop/source/mouse_shy_loop.mp4` | 鼠标停留害羞循环 |
| `guofeng_ai` | `mouse_leave_back` | source/WebM/keyframe/QA 已完成 | yes | `assets/profiles/guofeng_ai/actions/interactions/mouse_leave_back/source/mouse_leave_back_source.mp4` | 鼠标移开回 idle |
| `guofeng_ai` | `drag_hold_lift` | source/WebM/keyframe/QA 已完成 | yes | `assets/profiles/guofeng_ai/actions/interactions/drag_hold_lift/source/drag_hold_lift.mp4` | 拖拽保持循环，等待 start/end 衔接 |

## 其他待补视频

这些动作不是当前 `V1.2.0` 的阻塞主线，但仍在 `guofeng_ai` 长期素材完整度中：

| Stage | Actions | Current state |
| --- | --- | --- |
| PB3.1 main state | `reading` | 缺 source |
| PB2 events | `success`, `error`, `reminder` | 缺 source，但当前 runtime 有 fallback/状态表达，不阻塞 MCP |
| Priority Idle V1 | `duck_sit_head_hair`, `duck_sit_finger_lip`, `duck_sit_stretch` | 缺 source |
| Priority Idle V1 transitions | `stand_to_duck_sit`, `duck_sit_to_stand`, `duck_sit_to_sleep`, `sleep_to_stand` | 缺 source |
| PB3.1 idle variants | `idle_yawn`, `idle_hair` | 缺 source |
| Priority Idle V2 transitions | `stand_to_reading`, `reading_to_stand`, `stand_to_coding`, `coding_to_stand`, `stand_to_thinking`, `thinking_to_stand` | 缺 source |

## 新视频到位后的处理顺序

1. 放到表格中的精确 source path。
2. 运行 `python3 scripts/update_motion_progress.py --profile guofeng_ai --ensure-dirs`。
3. 运行 `python3 scripts/pb2_video_pipeline.py check --profile guofeng_ai --state <action>`。
4. 运行 `python3 scripts/pb2_video_pipeline.py convert --profile guofeng_ai --state <action>`。
5. 查看 alpha、checker、black、cyan、gray、magenta QA 图。
6. 通过 QA 后再更新 registry/states/runtime ready。
7. 最后运行 `python3 scripts/asset_check.py --profile guofeng_ai --strict --webm-strict`。

## QA 重点

- 人物实际大小必须对齐冻结 `idle`。
- 头顶、脚尖、发丝、袖口不能被裁切。
- 右下角水印/光标区域不能残留明显污染。
- click 动作必须短、轻、能回 idle。
- `drag_start_lift -> drag_hold_lift -> drag_end_dizzy` 必须衔接自然。
