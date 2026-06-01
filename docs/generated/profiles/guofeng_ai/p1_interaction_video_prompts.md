# Guofeng AI P1-A Interaction Video Prompts

Generated for `V1.2.0 - Interactive Companion Actions`.

## Global Requirements

- Profile: `guofeng_ai`
- Character: same ancient-style AI companion as current `guofeng_ai` runtime assets.
- Background: clean white or solid chroma background, no watermark, no text.
- Format: short MP4, 24fps, stable camera, full body visible, centered.
- Motion: starts from current standing idle pose where possible and ends in a pose that can return to idle.
- Do not add new props unless the action explicitly needs a small cursor/drag hint.

## Actions

| Action | Duration | Source Path | Prompt |
| --- | ---: | --- | --- |
| `mouse_hover_look` | 2.2s | `assets/profiles/guofeng_ai/actions/interactions/mouse_hover_look/source/mouse_hover_look_source.mp4` | Ancient-style AI companion stands relaxed on a clean white background, notices the user's mouse nearby, gently raises her head and eyes toward the viewer, subtle curious expression, small sleeve and hair movement, then holds a calm attentive pose. Full body, centered, no text, no watermark. |
| `mouse_leave_back` | 1.8s | `assets/profiles/guofeng_ai/actions/interactions/mouse_leave_back/source/mouse_leave_back_source.mp4` | Ancient-style AI companion on a clean white background softly returns her gaze from the viewer back to a neutral idle pose, expression relaxes, hair and sleeves settle naturally. Full body, centered, no text, no watermark. |
| `click_head_happy` | 2.4s | `assets/profiles/guofeng_ai/actions/interactions/click_head_happy/source/click_head_happy_source.mp4` | Ancient-style AI companion reacts to a gentle head tap, blinks happily, gives a small smile and tiny pleased nod, playful but restrained, then returns toward idle. Clean white background, full body, centered, no text, no watermark. |
| `click_body_confused` | 2.6s | `assets/profiles/guofeng_ai/actions/interactions/click_body_confused/source/click_body_confused_source.mp4` | Ancient-style AI companion reacts to a body tap with a slight surprised lean back, small puzzled head tilt, one hand lifts near chest, then recovers to neutral. Clean white background, full body, centered, no text, no watermark. |
| `drag_start_lift` | 1.6s | `assets/profiles/guofeng_ai/actions/interactions/drag_start_lift/source/drag_start_lift_source.mp4` | Ancient-style AI companion is gently picked up by an invisible cursor force, feet leave the ground, sleeves and hair lift slightly, expression surprised but cute, ending in a suspended pose suitable to connect to a drag-hold loop. Clean white background, full body, centered, no text, no watermark. |
| `drag_end_dizzy` | 2.2s | `assets/profiles/guofeng_ai/actions/interactions/drag_end_dizzy/source/drag_end_dizzy_source.mp4` | Ancient-style AI companion is gently set down from a suspended drag pose, lands softly, wobbles briefly with a tiny dizzy expression, then regains balance and returns toward idle. Clean white background, full body, centered, no text, no watermark. |

## Conversion Commands

After each source video is placed at the exact source path:

```bash
python3 scripts/pb2_video_pipeline.py check --profile guofeng_ai --state <action>
python3 scripts/pb2_video_pipeline.py convert --profile guofeng_ai --state <action>
python3 scripts/update_motion_progress.py --profile guofeng_ai --ensure-dirs
python3 scripts/asset_check.py --profile guofeng_ai --strict --webm-strict
```

If white-background matting is not good enough for a source clip, use the dedicated AI matting workflow before final WebM acceptance.
