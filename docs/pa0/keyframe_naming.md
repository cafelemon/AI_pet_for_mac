# Keyframe Naming

Keyframe files use this pattern:

```text
assets/keyframes/<state>/<state>_<index>.<ext>
```

Rules:

- `<state>` must match its immediate folder name.
- PA0 base states are `idle`, `coding`, `thinking`, `success`, `error`, `reminder`, and `sleep`.
- PA0 idle variants are `idle_reading`, `idle_yawn`, and `idle_hair`.
- `<index>` is a two-digit number starting from `01`.
- `<ext>` should be `png` for normalized PA0 keyframes.
- The first keyframe for each folder should be named `<folder>_01.png`.
- Keep the character subject consistent across all states.
- Normalized PA0 PNGs must be `1536x1728` RGBA with a transparent background.

Examples:

```text
assets/keyframes/idle/idle_01.png
assets/keyframes/coding/coding_01.png
assets/keyframes/idle_reading/idle_reading_01.png
```
