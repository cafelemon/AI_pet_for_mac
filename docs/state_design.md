# State Design

PA0 runtime states:

| State | Priority | Description |
|---|---:|---|
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

`waiting_auth` is reserved for the later Codex permission integration phase and is not a PA0 required keyframe.
