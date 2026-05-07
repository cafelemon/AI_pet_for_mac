# Layer Strategy

PA0 keeps assets simple while preserving future upgrade paths.

Recommended layers:

- Character subject: realistic face, skin tone, hairstyle, outfit, and body pose.
- State prop: computer, cup bed, book, fan, or reminder cue.
- State effect: fireworks, rain cloud, question mark, Zzz, or bubble arrow.
- Transparent background for clean desktop rendering.

Guidelines:

- The character should remain visually consistent across all states.
- Virtual elements should clarify state, not dominate the subject.
- Keep PA0 source photos in `assets/character/reference/pa0_raw/`.
- Keep normalized PA0 runtime keyframes in `assets/keyframes/`.
- Use `1536x1728` RGBA PNG as the PA0 normalized canvas.
- Treat `idle_reading`, `idle_yawn`, and `idle_hair` as idle small-action variants.
