# Action Inventory

P0 action resources now load from `data/config/action_registry.config.json`.

| Action ID | Legacy ID | New Path | Type | Runtime | Available | Protected | Notes |
|---|---|---|---|---|---|---|---|
| `idle` | `idle` | `assets/actions/states/idle/base` | state | yes | yes | no | Standing idle base loop |
| `reading` | `idle_reading` | `assets/actions/states/reading/base` | state | yes | yes | yes | Reading is now an independent main state; filenames stay `idle_reading_*` |
| `coding` | `coding` | `assets/actions/states/coding/base` | state | yes | yes | no | Coding main state |
| `thinking` | `thinking` | `assets/actions/states/thinking/base` | state | yes | yes | no | Thinking main state |
| `success` | `success` | `assets/actions/events/success` | event | yes | yes | no | Completion event |
| `error` | `error` | `assets/actions/events/error` | event | yes | yes | no | Failure event |
| `reminder` | `reminder` | `assets/actions/events/reminder` | event | yes | yes | no | Reminder event |
| `sleep` | `sleep` | `assets/actions/states/sleep/base` | state | yes | yes | yes | Protected sleep loop |
| `duck_sit_idle` | `duck_sit_idle` | `assets/actions/states/duck_sit/idle` | state | yes | yes | yes | Protected seated idle loop |
| `duck_sit_head_hair` | `duck_sit_head_hair` | `assets/actions/states/duck_sit/head_hair` | state_variant | yes | yes | no | Seated idle variant |
| `duck_sit_finger_lip` | `duck_sit_finger_lip` | `assets/actions/states/duck_sit/finger_lip` | state_variant | yes | yes | no | Seated idle variant |
| `duck_sit_stretch` | `duck_sit_stretch` | `assets/actions/states/duck_sit/stretch` | state_variant | yes | yes | no | Seated idle variant |
| `stand_to_duck_sit` | `stand_to_duck_sit` | `assets/actions/transitions/stand_to_duck_sit` | transition | yes | yes | yes | Protected posture bridge |
| `duck_sit_to_stand` | `duck_sit_to_stand` | `assets/actions/transitions/duck_sit_to_stand` | transition | yes | yes | yes | Protected posture bridge |
| `duck_sit_to_sleep` | `duck_sit_to_sleep` | `assets/actions/transitions/duck_sit_to_sleep` | transition | yes | yes | yes | Protected sleep-entry bridge |
| `sleep_to_stand` | `sleep_to_stand` | `assets/actions/transitions/sleep_to_stand` | transition | yes | yes | yes | Protected wake bridge |
| `idle_yawn` | `idle_yawn` | `assets/actions/states/idle/yawn` | state_variant | yes | yes | no | Standing idle variant |
| `idle_hair` | `idle_hair` | `assets/actions/states/idle/hair` | state_variant | yes | yes | no | Standing idle variant |
| `stand_to_reading` | `stand_to_reading` | `assets/actions/transitions/stand_to_reading` | transition | no | no | no | Placeholder only; source video pending |
| `reading_to_stand` | `reading_to_stand` | `assets/actions/transitions/reading_to_stand` | transition | no | no | no | Placeholder only; source video pending |
| `stand_to_coding` | `stand_to_coding` | `assets/actions/transitions/stand_to_coding` | transition | no | no | no | Placeholder only; source video pending |
| `coding_to_stand` | `coding_to_stand` | `assets/actions/transitions/coding_to_stand` | transition | no | no | no | Placeholder only; source video pending |
| `stand_to_thinking` | `stand_to_thinking` | `assets/actions/transitions/stand_to_thinking` | transition | no | no | no | Placeholder only; source video pending |
| `thinking_to_stand` | `thinking_to_stand` | `assets/actions/transitions/thinking_to_stand` | transition | no | no | no | Placeholder only; source video pending |
| `mouse_hover_look` | - | `assets/actions/interactions/mouse_hover_look` | interaction | no | no | no | P1-A placeholder; source video pending |
| `mouse_leave_back` | - | `assets/actions/interactions/mouse_leave_back` | interaction | no | no | no | P1-A placeholder; source video pending |
| `click_head_happy` | - | `assets/actions/interactions/click_head_happy` | interaction | no | no | no | P1-A placeholder; source video pending |
| `click_body_confused` | - | `assets/actions/interactions/click_body_confused` | interaction | no | no | no | P1-A placeholder; source video pending |
| `drag_start_lift` | - | `assets/actions/interactions/drag_start_lift` | interaction | no | no | no | P1-A placeholder; source video pending |
| `drag_end_dizzy` | - | `assets/actions/interactions/drag_end_dizzy` | interaction | no | no | no | P1-A placeholder; source video pending |
