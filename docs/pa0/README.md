# PA0: Asset And Keyframe Spec

PA0 establishes the keyframe asset base for Desktop AI Companion.

Deliverables:

- `assets/keyframes/` with normalized transparent PNG keyframes.
- `assets/character/reference/pa0_raw/` with the original source photos.
- Keyframe naming rules.
- State action checklist.
- Character and virtual effect layer strategy.
- `scripts/asset_check.py` for local validation.
- `scripts/process_pa0_keyframes.m` for regenerating normalized keyframes from PA0 raw photos.
- `docs/pa0/qa_keyframes_contact.png` for visual QA.

PA0 required keyframe folders:

```text
idle
coding
thinking
success
error
reminder
sleep
idle_reading
idle_yawn
idle_hair
```

`idle_reading`, `idle_yawn`, and `idle_hair` are idle small-action variants, not separate high-priority runtime states.

Normalized PA0 keyframes are `1536x1728` RGBA PNG files with transparent backgrounds.
