# State Design

PA0 runtime states:

| State | Priority | Description |
|---|---:|---|
| waiting_auth | P0 | Codex is waiting for user approval. |
| error | P1 | Task failed or abnormal logs appeared. |
| reminder | P2 | Local scheduler reminder. |
| coding | P3 | Agent or Codex task is running. |
| thinking | P4 | Long-running analysis without tool activity. |
| success | P5 | Short completion feedback before returning to idle. |
| weather | P6 | Weather notification, reserved for PA5. |
| sleep | P7 | Long idle period. |
| idle | P8 | Default state. |

Idle variants:

| Variant | Parent State | Description |
|---|---|---|
| idle_reading | idle | Small idle action: seated reading. |
| idle_yawn | idle | Small idle action: yawning. |
| idle_hair | idle | Small idle action: adjusting hair. |

PA3 renders `waiting_auth` with the `reminder` keyframe until a dedicated approval asset exists.

PA3 hook semantics:

| Hook Event | Runtime State |
|---|---|
| PreToolUse | coding |
| PostToolUse success | thinking |
| PostToolUse failure | error |
| PermissionRequest | waiting_auth |
| Stop | success |

PA4 reminders use the `reminder` state and are ordered by reminder priority, then due time. Runtime priority still keeps `waiting_auth` and `error` ahead of reminders.

PA6 skips PA5 weather until weather keyframes exist. Task-center stuck notifications also render through the `reminder` state; `waiting_auth` and `error` remain higher priority, and local reminders win ties with task stuck notifications.
