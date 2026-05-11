# PB2 Motion Asset Workflow

PB2 turns the PA0/PB1 static renderer into a full state-motion set. The runtime prefers transparent WebM loops from `assets/webm/<state>/<state>_loop.webm`, can preview local source MP4 files while WebM outputs are missing, and keeps PNG fallback behavior from PB1.

## States

| State | Action | Playback |
|---|---|---|
| `idle` | 站立、呼吸、眨眼、轻微重心变化 | `loop` |
| `idle_yawn` | 站立打哈欠，结束回自然站姿 | `one_shot` |
| `idle_hair` | 顺头发，结束回自然站姿 | `one_shot` |
| `idle_reading` | 侧坐看书，轻微翻页/眨眼 | `loop` |
| `coding` | 小电脑前敲代码 | `loop` |
| `thinking` | 趴着双手撑头，脚晃，问号变化 | `loop` |
| `error` | 鸭子坐，小阴云下雨 | `one_shot` |
| `success` | 跳起来，小烟花爆开，落回站姿 | `one_shot` |
| `sleep` | 小杯子里睡觉，Zzz 漂浮 | `loop` |
| `reminder` | 手叉腰，手指向提醒气泡方向 | `one_shot` |

`waiting_auth` continues to use the `reminder` render asset.

## Source Video Handoff

Generate the white-background keyframe pack:

```bash
python3 scripts/prepare_pb2_keyframes.py
```

Use the generated prompts and reference images in:

```text
assets/character/reference/pb2_white_keyframes/<state>/
```

Put source videos here. The default handoff path is:

```text
assets/states/<state>/source/<state>_source.mp4
```

Current imported files may keep their existing names, such as `<state>_jimeng.mp4`. Record the actual provider and watermark strategy in:

```text
data/config/motion_sources.config.json
```

The source videos should be 3-5 seconds, pure white background, fixed camera, full body visible, no shadow, no subtitles, and preferably no watermark. If a watermark is unavoidable, use a per-provider mask preset instead of applying a global Jimeng mask.

For prop-heavy states such as `coding`, completeness comes first and transparency friendliness comes second:

- keep the character, desk, chair, and laptop fully visible in every frame
- avoid pure-white desk or chair surfaces that blend into the white background; prefer light gray, beige-gray, or pale wood tones
- reject any source where chair legs, desk legs, shoes, or laptop corners disappear into the background before conversion

## Conversion

Check source video presence:

```bash
python3 scripts/pb2_video_pipeline.py check --skip-missing
```

The check/convert script reads `data/config/motion_catalog.config.json`, so it also supports future PB3 actions such as `wave`, `cheer`, and `bye`.

Convert a single state after ffmpeg is installed. The default conversion reads each action's provider and mask preset from `data/config/motion_sources.config.json`:

```bash
python3 scripts/pb2_video_pipeline.py convert --state coding
```

If you need to override the configured mask for one run:

```bash
python3 scripts/pb2_video_pipeline.py convert --state coding --mask-preset jimeng_corner
python3 scripts/pb2_video_pipeline.py convert --state sleep --mask-preset kling_corner
python3 scripts/pb2_video_pipeline.py convert --state idle_reading --matte-preset neutral_floor
```

Convert all states:

```bash
python3 scripts/pb2_video_pipeline.py convert --state all --skip-missing
```

The conversion script writes:

```text
assets/webm/<state>/<state>_loop.webm
docs/pb2/qa/<state>_contact.png
docs/pb2/qa/magenta/<state>_magenta.png
docs/pb2/qa/black/<state>_black.png
docs/pb2/qa/cyan/<state>_cyan.png
docs/pb2/qa/alpha/<state>_alpha.png
```

The default conversion pipeline only removes white or near-white pixels that are connected to the frame edge. This preserves internal white clothing, hair highlights, cup edges, and VFX. For sources with a gray studio floor, use the configured `neutral_floor` matte preset. If a source has a stronger white fringe, tune `--background-similarity`.

For `coding`, acceptance requires the magenta, black, and cyan QA sheets to keep the full chair, full desk legs, intact laptop silhouette, and an uncut body outline. If any of those are incomplete, fix the source or tighten the `coding` cleanup rules before accepting the asset.

## Validation

Run normal checks while WebM assets are incomplete:

```bash
npm run typecheck
npm run asset:check:strict
```

Run full PB2 asset validation only after all WebM outputs exist:

```bash
python3 scripts/asset_check.py --strict --webm-strict
```
