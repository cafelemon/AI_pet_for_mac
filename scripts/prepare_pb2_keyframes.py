#!/usr/bin/env python3
"""Build PB2 white-background Jimeng keyframes and prompt sheets."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import struct
import zlib

import action_registry


ROOT = Path(__file__).resolve().parents[1]
CANVAS_SIZE = (1536, 1728)
OUTPUT_ROOT = ROOT / "assets" / "character" / "reference" / "pb2_white_keyframes"
WHITE = (255, 255, 255, 255)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class ActionSpec:
    state: str
    source: str
    playback: str
    duration_seconds: str
    action: str
    prompt: str
    end_source: str | None = None


GENERAL_PROMPT = """\
使用提供的纯白背景关键帧作为角色一致性参考，生成 3-5 秒短视频。
画面要求：9:16 竖屏，纯白背景，固定镜头，主体完整不裁切，无阴影，无地面，无水印，无字幕。
角色要求：保持参考图中的同一个真人桌宠角色、服装、发型、面部一致，不要改变年龄、体型、五官或服饰。
动作要求：动作自然轻微，适合作为透明桌宠循环或短动作，动作幅度不要过大。
输出要求：尽量导出 MP4，文件名按 <state>_jimeng.mp4 命名。
"""


ACTIONS = (
    ActionSpec(
        state="idle",
        source="idle/idle_01.png",
        playback="loop",
        duration_seconds="4-5",
        action="站立、呼吸、眨眼、轻微重心变化",
        prompt="让角色自然站立，轻微呼吸、眨眼，身体有非常小的重心变化，适合无缝循环。",
    ),
    ActionSpec(
        state="idle_yawn",
        source="idle_yawn/idle_yawn_01.png",
        end_source="idle",
        playback="one_shot",
        duration_seconds="3-4",
        action="站立打哈欠，结束回自然站姿",
        prompt="让角色站立时打一个可爱的哈欠，抬手遮嘴，动作结束回到自然站姿。",
    ),
    ActionSpec(
        state="idle_hair",
        source="idle_hair/idle_hair_01.png",
        end_source="idle",
        playback="one_shot",
        duration_seconds="3-4",
        action="顺头发，结束回自然站姿",
        prompt="让角色轻轻顺一下头发，动作温柔自然，最后回到自然站姿。",
    ),
    ActionSpec(
        state="reading",
        source="reading/idle_reading_01.png",
        playback="loop",
        duration_seconds="4-5",
        action="侧坐看书，轻微翻页/眨眼",
        prompt="让角色侧坐看书，轻微眨眼，手部有小幅翻页动作，整体适合安静循环。",
    ),
    ActionSpec(
        state="coding",
        source="coding/coding_01.png",
        playback="loop",
        duration_seconds="4-5",
        action="小电脑前敲代码",
        prompt="让角色坐在小电脑前敲代码，手指轻快敲键盘，眼神专注，屏幕不要出现文字。",
    ),
    ActionSpec(
        state="thinking",
        source="thinking/thinking_01.png",
        playback="loop",
        duration_seconds="4-5",
        action="趴着双手撑头，脚晃，问号变化",
        prompt="让角色趴着双手撑头思考，脚丫轻轻晃动，头上出现小问号并轻微浮动变化。",
    ),
    ActionSpec(
        state="error",
        source="error/error_01.png",
        playback="loop",
        duration_seconds="4-5",
        action="鸭子坐，小阴云下雨",
        prompt="让角色鸭子坐，有点沮丧，头顶小阴云轻轻下雨，雨滴循环但不要遮住脸。",
    ),
    ActionSpec(
        state="success",
        source="success/success_01.png",
        end_source="idle",
        playback="one_shot",
        duration_seconds="2-3",
        action="跳起来，小烟花爆开，落回站姿",
        prompt="让角色开心地轻轻跳起来，旁边有小烟花粒子爆开，落地后回到自然站姿。",
    ),
    ActionSpec(
        state="sleep",
        source="sleep/sleep_01.png",
        playback="loop",
        duration_seconds="5",
        action="小杯子里睡觉，Zzz 漂浮",
        prompt="让角色在小杯子里安静睡觉，身体轻微呼吸起伏，Zzz 符号缓慢漂浮。",
    ),
    ActionSpec(
        state="reminder",
        source="reminder/reminder_01.png",
        playback="loop",
        duration_seconds="4-5",
        action="手叉腰，手指向提醒气泡方向",
        prompt="让角色手叉腰，另一只手指向右上方提醒气泡方向，表情认真但可爱，动作可循环。",
    ),
)


def paeth_predictor(left: int, up: int, upper_left: int) -> int:
    estimate = left + up - upper_left
    distance_left = abs(estimate - left)
    distance_up = abs(estimate - up)
    distance_upper_left = abs(estimate - upper_left)
    if distance_left <= distance_up and distance_left <= distance_upper_left:
        return left
    if distance_up <= distance_upper_left:
        return up
    return upper_left


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def read_rgba_png(path: Path) -> tuple[int, int, bytearray]:
    with path.open("rb") as handle:
        if handle.read(len(PNG_SIGNATURE)) != PNG_SIGNATURE:
            raise ValueError(f"{path.relative_to(ROOT)} is not a PNG")

        width = 0
        height = 0
        bit_depth = 0
        color_type = 0
        interlace = 0
        idat_parts: list[bytes] = []

        while True:
            length_bytes = handle.read(4)
            if not length_bytes:
                break
            length = struct.unpack(">I", length_bytes)[0]
            kind = handle.read(4)
            data = handle.read(length)
            handle.read(4)

            if kind == b"IHDR":
                width, height, bit_depth, color_type, _compression, _filter, interlace = struct.unpack(">IIBBBBB", data)
            elif kind == b"IDAT":
                idat_parts.append(data)
            elif kind == b"IEND":
                break

    if (width, height) != CANVAS_SIZE:
        raise ValueError(f"{path.relative_to(ROOT)} is {(width, height)}, expected {CANVAS_SIZE}")
    if bit_depth != 8 or color_type != 6 or interlace != 0:
        raise ValueError(f"{path.relative_to(ROOT)} must be 8-bit non-interlaced RGBA PNG")

    bytes_per_pixel = 4
    stride = width * bytes_per_pixel
    decompressed = zlib.decompress(b"".join(idat_parts))
    rows = bytearray(width * height * bytes_per_pixel)
    previous = bytearray(stride)
    offset = 0

    for row_index in range(height):
        filter_type = decompressed[offset]
        offset += 1
        raw = bytearray(decompressed[offset : offset + stride])
        offset += stride
        row = bytearray(stride)

        for index, value in enumerate(raw):
            left = row[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            up = previous[index]
            upper_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0

            if filter_type == 0:
                reconstructed = value
            elif filter_type == 1:
                reconstructed = value + left
            elif filter_type == 2:
                reconstructed = value + up
            elif filter_type == 3:
                reconstructed = value + ((left + up) // 2)
            elif filter_type == 4:
                reconstructed = value + paeth_predictor(left, up, upper_left)
            else:
                raise ValueError(f"unsupported PNG filter {filter_type} in {path.relative_to(ROOT)}")

            row[index] = reconstructed & 0xFF

        rows[row_index * stride : (row_index + 1) * stride] = row
        previous = row

    return width, height, rows


def write_rgb_png(path: Path, width: int, height: int, rgb: bytes) -> None:
    stride = width * 3
    scanlines = bytearray()
    for row_index in range(height):
        scanlines.append(0)
        scanlines.extend(rgb[row_index * stride : (row_index + 1) * stride])

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        PNG_SIGNATURE
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(bytes(scanlines), level=9))
        + png_chunk(b"IEND", b"")
    )


def compose_on_white(source: Path, output: Path) -> None:
    width, height, rgba = read_rgba_png(source)
    rgb = bytearray(width * height * 3)

    for pixel_index in range(width * height):
        source_index = pixel_index * 4
        target_index = pixel_index * 3
        alpha = rgba[source_index + 3]
        inverse_alpha = 255 - alpha
        rgb[target_index] = (rgba[source_index] * alpha + WHITE[0] * inverse_alpha + 127) // 255
        rgb[target_index + 1] = (rgba[source_index + 1] * alpha + WHITE[1] * inverse_alpha + 127) // 255
        rgb[target_index + 2] = (rgba[source_index + 2] * alpha + WHITE[2] * inverse_alpha + 127) // 255

    write_rgb_png(output, width, height, bytes(rgb))


def write_prompt(action: ActionSpec, output_dir: Path) -> None:
    prompt_path = output_dir / f"{action.state}_jimeng_prompt.md"
    source_dir = action_registry.source_dir(action.state)
    webm_path = action_registry.webm_path(action.state)
    prompt_path.write_text(
        "\n".join(
            [
                f"# {action.state}",
                "",
                "## 动作规格",
                "",
                f"- 播放类型：`{action.playback}`",
                f"- 建议时长：{action.duration_seconds} 秒",
                f"- 动作：{action.action}",
                f"- 源视频放置：`{source_dir.relative_to(ROOT)}`",
                f"- 最终 WebM：`{webm_path.relative_to(ROOT)}`",
                "",
                "## 即梦提示词",
                "",
                GENERAL_PROMPT.strip(),
                "",
                f"具体动作：{action.prompt}",
                "",
            ]
        ),
        encoding="utf-8",
    )


def write_root_readme() -> None:
    lines = [
        "# PB2 White Keyframe Pack",
        "",
        "这些文件用于即梦生成 PB2 短视频。每个状态目录内的 `*_start.png` 是首帧参考，需要回到自然姿态的动作会额外提供 `*_end.png`。",
        "",
        "生成视频后，把文件放到对应目录：",
        "",
        "```text",
        "assets/actions/<category>/<action>/source/",
        "```",
        "",
        "统一要求：纯白背景、固定镜头、主体完整、无阴影、无水印、无字幕、3-5 秒。",
        "",
        "| State | Playback | Source video |",
        "|---|---|---|",
    ]
    for action in ACTIONS:
        source_dir = action_registry.source_dir(action.state)
        lines.append(
            f"| `{action.state}` | `{action.playback}` | `{source_dir.relative_to(ROOT)}` |"
        )
    lines.append("")
    (OUTPUT_ROOT / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    for action in ACTIONS:
        output_dir = OUTPUT_ROOT / action.state
        compose_on_white(action_registry.fallback_path(action.state), output_dir / f"{action.state}_start.png")
        if action.end_source:
            compose_on_white(action_registry.fallback_path(action.end_source), output_dir / f"{action.state}_end.png")
        write_prompt(action, output_dir)

        source_dir = action_registry.source_dir(action.state)
        source_dir.mkdir(parents=True, exist_ok=True)
        (source_dir / ".gitkeep").touch()

    write_root_readme()
    print(f"PB2 keyframe pack written to {OUTPUT_ROOT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
