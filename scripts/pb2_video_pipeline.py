#!/usr/bin/env python3
"""Validate PB2 source videos and convert them to transparent WebM."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CANVAS_SIZE = (1536, 1728)
CATALOG_PATH = ROOT / "data" / "config" / "motion_catalog.config.json"
SOURCES_PATH = ROOT / "data" / "config" / "motion_sources.config.json"
MASK_PRESETS = ("auto", "none", "jimeng_corner", "kling_corner")
MATTE_PRESETS = ("auto", "white", "neutral_floor")
FLOOD_FILL_MARKER = (255, 0, 0)


def load_source_config() -> dict[str, object]:
    if not SOURCES_PATH.exists():
        return {
            "defaults": {
                "provider": "unknown",
                "sourceFile": None,
                "maskPreset": "none",
                "mattePreset": "white",
            },
            "sources": {},
        }
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))


def load_states() -> tuple[str, ...]:
    if not CATALOG_PATH.exists():
        return (
            "idle",
            "idle_yawn",
            "idle_hair",
            "idle_reading",
            "coding",
            "thinking",
            "error",
            "success",
            "sleep",
            "reminder",
        )

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return tuple(str(action["id"]) for action in catalog["actions"])


def source_dir(state: str) -> Path:
    return ROOT / "assets" / "states" / state / "source"


def source_info(state: str) -> dict[str, str | None]:
    config = load_source_config()
    defaults = dict(config.get("defaults", {}))
    sources = config.get("sources", {})
    if isinstance(sources, dict):
        defaults.update(sources.get(state, {}))

    provider = defaults.get("provider") or "unknown"
    source_file = defaults.get("sourceFile")
    mask_preset = defaults.get("maskPreset") or "none"
    matte_preset = defaults.get("mattePreset") or "white"
    return {
        "provider": str(provider),
        "sourceFile": str(source_file) if source_file else None,
        "maskPreset": str(mask_preset),
        "mattePreset": str(matte_preset),
    }


def source_candidates(state: str) -> list[Path]:
    info = source_info(state)
    directory = source_dir(state)
    candidates: list[Path] = []
    if info["sourceFile"]:
        candidates.append(directory / info["sourceFile"])
    candidates.extend(
        [
            directory / f"{state}_jimeng.mp4",
            directory / f"{state}_kling.mp4",
            directory / f"{state}_source.mp4",
        ]
    )
    candidates.extend(sorted(directory.glob("*.mp4")) if directory.exists() else [])

    unique: list[Path] = []
    seen: set[Path] = set()
    for path in candidates:
        if path not in seen:
            unique.append(path)
            seen.add(path)
    return unique


def source_video(state: str) -> Path:
    for candidate in source_candidates(state):
        if candidate.exists():
            return candidate
    info = source_info(state)
    if info["sourceFile"]:
        return source_dir(state) / info["sourceFile"]
    return source_dir(state) / f"{state}_source.mp4"


def output_webm(state: str) -> Path:
    return ROOT / "assets" / "webm" / state / f"{state}_loop.webm"


def qa_contact_sheet(state: str) -> Path:
    return ROOT / "docs" / "pb2" / "qa" / f"{state}_contact.png"


def resolve_tool(name: str, explicit_path: str | None) -> str:
    if explicit_path:
        return explicit_path
    path = shutil.which(name)
    if not path:
        raise FileNotFoundError(f"{name} was not found. Install ffmpeg or pass --{name}-path.")
    return path


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


def probe_video(ffprobe: str, path: Path) -> dict[str, object]:
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,duration,nb_frames,r_frame_rate",
            "-of",
            "json",
            str(path),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(result.stdout).get("streams", [])
    return streams[0] if streams else {}


def selected_states(state: str) -> tuple[str, ...]:
    states = load_states()
    return states if state == "all" else (state,)


def check_sources(ffprobe: str | None, states: tuple[str, ...], skip_missing: bool) -> int:
    failures = 0
    for state in states:
        path = source_video(state)
        info = source_info(state)
        if not path.exists():
            if skip_missing:
                print(f"SKIP: {path.relative_to(ROOT)}")
                continue
            print(f"MISS: {path.relative_to(ROOT)}")
            failures += 1
            continue

        if ffprobe:
            info = probe_video(ffprobe, path)
            width = info.get("width", "?")
            height = info.get("height", "?")
            duration = info.get("duration", "?")
            source_meta = source_info(state)
            print(
                "OK: "
                f"{path.relative_to(ROOT)} {width}x{height} duration={duration} "
                f"provider={source_meta['provider']} mask={source_meta['maskPreset']} "
                f"matte={source_meta['mattePreset']}"
            )
        else:
            print(
                f"OK: {path.relative_to(ROOT)} provider={info['provider']} "
                f"mask={info['maskPreset']} matte={info['mattePreset']}"
            )

    return 1 if failures else 0


def resolve_mask_preset(state: str, requested_preset: str, mask_watermark: bool) -> str:
    if mask_watermark:
        return "jimeng_corner"
    if requested_preset != "auto":
        return requested_preset
    preset = source_info(state)["maskPreset"] or "none"
    if preset not in MASK_PRESETS:
        raise ValueError(f"unknown mask preset for {state}: {preset}")
    if preset == "auto":
        return "none"
    return preset


def resolve_matte_preset(state: str, requested_preset: str) -> str:
    if requested_preset != "auto":
        return requested_preset
    preset = source_info(state)["mattePreset"] or "white"
    if preset not in MATTE_PRESETS:
        raise ValueError(f"unknown matte preset for {state}: {preset}")
    if preset == "auto":
        return "white"
    return preset


def color_prep_filters(mask_preset: str) -> list[str]:
    filters = [
        f"scale={CANVAS_SIZE[0]}:{CANVAS_SIZE[1]}:force_original_aspect_ratio=decrease",
        f"pad={CANVAS_SIZE[0]}:{CANVAS_SIZE[1]}:(ow-iw)/2:(oh-ih)/2:white",
    ]
    if mask_preset == "jimeng_corner":
        filters.extend(
            [
                "drawbox=x=iw-520:y=0:w=520:h=180:color=white:t=fill",
                "drawbox=x=iw-560:y=ih-240:w=560:h=240:color=white:t=fill",
            ]
        )
    elif mask_preset == "kling_corner":
        filters.append("drawbox=x=iw-440:y=ih-150:w=440:h=150:color=white:t=fill")
    elif mask_preset != "none":
        raise ValueError(f"unknown mask preset: {mask_preset}")
    filters.append("format=rgb24")
    return filters


def marker_to_alpha_filters() -> list[str]:
    marker_r, marker_g, marker_b = FLOOD_FILL_MARKER
    # FFmpeg's RGB floodfill writes this marker as green in the RGB frame that
    # follows, so the second colorkey pass treats green as connected background.
    return [
        (
            "floodfill=x=0:y=0:"
            "s0=0:s1=0:s2=0:"
            f"d0={marker_r}:d1={marker_g}:d2={marker_b}"
        ),
        "colorkey=0x00ff00:0.01:0",
        "format=rgba",
        "alphaextract",
        "format=gray",
    ]


def white_connected_matte_filter(background_similarity: float) -> str:
    return ",".join(
        [
            f"colorkey=0xffffff:{background_similarity}:0",
            "format=rgba",
            "alphaextract",
            "format=rgb24",
            *marker_to_alpha_filters(),
        ]
    )


def neutral_floor_matte_filter() -> str:
    rgb_min = "min(min(r(X,Y),g(X,Y)),b(X,Y))"
    rgb_max = "max(max(r(X,Y),g(X,Y)),b(X,Y))"
    background_candidate = f"if(lte({rgb_max}-{rgb_min},38)*gte({rgb_max},105),0,255)"
    return ",".join(
        [
            f"geq=r='{background_candidate}':g='{background_candidate}':b='{background_candidate}'",
            *marker_to_alpha_filters(),
        ]
    )


def connected_background_matte_filter(background_similarity: float, matte_preset: str) -> str:
    if matte_preset == "white":
        return white_connected_matte_filter(background_similarity)
    if matte_preset == "neutral_floor":
        return neutral_floor_matte_filter()
    raise ValueError(f"unknown matte preset: {matte_preset}")


def convert_state(
    ffmpeg: str,
    state: str,
    crf: int,
    background_similarity: float,
    mask_preset: str,
    matte_preset: str,
) -> Path:
    source = source_video(state)
    if not source.exists():
        raise FileNotFoundError(f"missing source video: {source.relative_to(ROOT)}")

    output = output_webm(state)
    output.parent.mkdir(parents=True, exist_ok=True)

    color_filter = ",".join(color_prep_filters(mask_preset))
    matte_filter = connected_background_matte_filter(background_similarity, matte_preset)
    video_filter = (
        f"[0:v]{color_filter},split[color][masksrc];"
        f"[masksrc]{matte_filter}[alpha];"
        "[color][alpha]alphamerge,format=yuva420p"
    )
    run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-i",
            str(source),
            "-filter_complex",
            video_filter,
            "-an",
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuva420p",
            "-auto-alt-ref",
            "0",
            "-b:v",
            "0",
            "-crf",
            str(crf),
            str(output),
        ]
    )
    return output


def write_overlay_contact_sheet(ffmpeg: str, state: str, webm: Path, background: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    pad_color = "white" if background == "white" else background
    video_filter = (
        f"[0:v]fps=1,format=rgba[fg];"
        f"color=c={background}:s={CANVAS_SIZE[0]}x{CANVAS_SIZE[1]}:r=1:d=60[bg];"
        "[bg][fg]overlay=shortest=1:format=auto,"
        "scale=256:288:force_original_aspect_ratio=decrease,"
        f"pad=256:288:(ow-iw)/2:(oh-ih)/2:{pad_color},"
        f"tile=6x1:color={pad_color}"
    )
    run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-c:v",
            "libvpx-vp9",
            "-i",
            str(webm),
            "-filter_complex",
            video_filter,
            "-frames:v",
            "1",
            "-update",
            "1",
            str(output),
        ]
    )


def write_alpha_contact_sheet(ffmpeg: str, state: str, webm: Path) -> None:
    output = ROOT / "docs" / "pb2" / "qa" / "alpha" / f"{state}_alpha.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    video_filter = (
        "fps=1,alphaextract,"
        "scale=256:288:force_original_aspect_ratio=decrease,"
        "pad=256:288:(ow-iw)/2:(oh-ih)/2:black,"
        "tile=6x1:color=black"
    )
    run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-c:v",
            "libvpx-vp9",
            "-i",
            str(webm),
            "-vf",
            video_filter,
            "-frames:v",
            "1",
            "-update",
            "1",
            str(output),
        ]
    )


def write_contact_sheet(ffmpeg: str, state: str, webm: Path) -> None:
    write_overlay_contact_sheet(ffmpeg, state, webm, "white", qa_contact_sheet(state))
    write_overlay_contact_sheet(
        ffmpeg,
        state,
        webm,
        "magenta",
        ROOT / "docs" / "pb2" / "qa" / "magenta" / f"{state}_magenta.png",
    )
    write_alpha_contact_sheet(ffmpeg, state, webm)


def main() -> int:
    parser = argparse.ArgumentParser(description="PB2 source video validation and WebM conversion.")
    parser.add_argument("command", choices=("check", "convert"))
    parser.add_argument("--state", choices=("all",) + load_states(), default="all")
    parser.add_argument("--ffmpeg-path")
    parser.add_argument("--ffprobe-path")
    parser.add_argument("--crf", type=int, default=32)
    parser.add_argument("--background-similarity", type=float, default=0.18)
    parser.add_argument("--background-white-min", type=int, default=200, help=argparse.SUPPRESS)
    parser.add_argument("--background-chroma", type=int, default=80, help=argparse.SUPPRESS)
    parser.add_argument("--white-similarity", type=float, default=0.055, help=argparse.SUPPRESS)
    parser.add_argument("--white-blend", type=float, default=0.035, help=argparse.SUPPRESS)
    parser.add_argument("--skip-missing", action="store_true", help="Skip missing source videos during conversion.")
    parser.add_argument(
        "--mask-preset",
        choices=MASK_PRESETS,
        default="auto",
        help="Watermark mask preset. auto reads data/config/motion_sources.config.json.",
    )
    parser.add_argument(
        "--matte-preset",
        choices=MATTE_PRESETS,
        default="auto",
        help="Background matte preset. auto reads data/config/motion_sources.config.json.",
    )
    parser.add_argument(
        "--mask-watermark",
        action="store_true",
        help="Deprecated alias for --mask-preset jimeng_corner.",
    )
    args = parser.parse_args()

    states = selected_states(args.state)

    if args.command == "check":
        ffprobe = args.ffprobe_path or shutil.which("ffprobe")
        return check_sources(ffprobe, states, args.skip_missing)

    ffmpeg = resolve_tool("ffmpeg", args.ffmpeg_path)
    for state in states:
        if args.skip_missing and not source_video(state).exists():
            print(f"SKIP: {source_video(state).relative_to(ROOT)}")
            continue
        mask_preset = resolve_mask_preset(state, args.mask_preset, args.mask_watermark)
        matte_preset = resolve_matte_preset(state, args.matte_preset)
        webm = convert_state(ffmpeg, state, args.crf, args.background_similarity, mask_preset, matte_preset)
        write_contact_sheet(ffmpeg, state, webm)
        provider = source_info(state)["provider"]
        print(f"WROTE: {webm.relative_to(ROOT)} provider={provider} mask={mask_preset} matte={matte_preset}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
