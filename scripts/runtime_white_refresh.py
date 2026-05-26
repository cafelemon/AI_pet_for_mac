#!/usr/bin/env python3
"""Run white-skill matting, runtime projection, QA, and duration sync for runtime states."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pb2_video_pipeline as pb2


ROOT = Path(__file__).resolve().parents[1]
STATES_CONFIG_PATH = ROOT / "data" / "config" / "states.config.json"
WHITE_SKILL_PYTHON = ROOT / "skills" / "white-bg-video-matting" / ".venv" / "bin" / "python"
WHITE_SKILL_SCRIPT = ROOT / "skills" / "white-bg-video-matting" / "matting_video.py"
QUEUE = (
    "idle",
    "duck_sit_idle",
    "sleep",
    "idle_hair",
    "idle_yawn",
    "reading",
    "reminder",
    "success",
    "duck_sit_head_hair",
    "duck_sit_finger_lip",
    "duck_sit_stretch",
    "error",
    "stand_to_duck_sit",
    "duck_sit_to_stand",
    "duck_sit_to_sleep",
    "sleep_to_stand",
)
RAW_QA_SOURCE_DIR = ROOT / "docs" / "pb2" / "qa" / "source_white"
SLEEP_FAMILY_STATES = frozenset({"sleep", "duck_sit_to_sleep", "sleep_to_stand"})
SLEEP_SHARED_MODEL_CACHE = pb2.source_dir("sleep") / ".matting_work" / "shared_model_cache"
LEGACY_SHARED_MODEL_CACHE = pb2.source_dir("thinking") / ".matting_work" / "shared_model_cache"
DEFAULT_MODEL = "isnet-general-use"
SLEEP_FAMILY_MODEL = "birefnet-general"


@dataclass(frozen=True)
class WhiteParams:
    alpha_expand: int
    alpha_blur: float
    erode_size: int


PRESET_DEFAULTS: dict[str, WhiteParams] = {
    "white": WhiteParams(alpha_expand=3, alpha_blur=0.6, erode_size=5),
    "neutral_floor": WhiteParams(alpha_expand=5, alpha_blur=0.5, erode_size=3),
    "sleep_props": WhiteParams(alpha_expand=5, alpha_blur=0.5, erode_size=3),
}


def preferred_model_for_state(state: str) -> str:
    if state in SLEEP_FAMILY_STATES:
        return SLEEP_FAMILY_MODEL
    return DEFAULT_MODEL


def model_cache_filename(model: str) -> str:
    return f"{model.replace('_', '-')}.onnx"


def run(command: list[str], *, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=ROOT, check=True, env=env)


def capture(command: list[str], *, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True, env=env)


def ffprobe_duration_ms(path: Path) -> tuple[float, int]:
    result = capture(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    duration_s = float(result.stdout.strip())
    duration_ms = int(round(duration_s * 1000 / 10.0) * 10)
    return duration_s, duration_ms


def measure_alpha_bbox(state: str, path: Path) -> pb2.BoundingBox | None:
    ffmpeg = pb2.resolve_tool("ffmpeg", None)
    command = [ffmpeg, "-v", "info"]
    if path.suffix.lower() == ".webm":
        command.extend(["-c:v", "libvpx-vp9"])
    command.extend(
        [
            "-i",
            str(path),
            "-vf",
            "fps=1,alphaextract,bbox=min_val=16",
            "-f",
            "null",
            "-",
        ]
    )
    result = capture(command)
    boxes: list[pb2.BoundingBox] = []
    for match in pb2.BBOX_PATTERN.finditer(result.stderr):
        boxes.append(
            pb2.BoundingBox(
                x1=int(match.group("x1")),
                y1=int(match.group("y1")),
                x2=int(match.group("x2")),
                y2=int(match.group("y2")),
            )
            )
    if not boxes:
        return None
    selected = pb2.selected_reference_boxes_for_state(state, boxes)
    union = pb2.union_bounding_boxes(selected) or pb2.union_bounding_boxes(boxes)
    return union


def load_states_config() -> dict[str, object]:
    return json.loads(STATES_CONFIG_PATH.read_text(encoding="utf-8"))


def save_states_config(payload: dict[str, object]) -> None:
    STATES_CONFIG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def state_workdir(state: str, label: str) -> Path:
    return pb2.source_dir(state) / ".matting_work" / label


def white_params_for_state(state: str) -> WhiteParams:
    matte_preset = pb2.source_info(state)["mattePreset"] or "white"
    try:
        return PRESET_DEFAULTS[matte_preset]
    except KeyError as exc:
        raise ValueError(f"Unsupported matte preset for {state}: {matte_preset}") from exc


def copy_raw_skill_samples(state: str, workdir: Path) -> None:
    RAW_QA_SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    qa_dir = workdir / "qa"
    samples = {
        f"{state}_source.png": qa_dir / "sample_frames" / "first.png",
        f"{state}_mid_latest.png": qa_dir / "sample_frames" / "middle.png",
        f"{state}_last_latest.png": qa_dir / "sample_frames" / "last.png",
        f"{state}_preview_grid.jpg": qa_dir / "preview_grid.jpg",
    }
    for output_name, source in samples.items():
        if source.exists():
            shutil.copy2(source, RAW_QA_SOURCE_DIR / output_name)


def white_skill_output_path(state: str, label: str) -> Path:
    return pb2.source_dir(state) / ".matting_work" / f"{label}.webm"


def projected_preview_output_path(state: str, label: str) -> Path:
    return state_workdir(state, label) / "runtime_preview" / f"{state}_runtime_preview.webm"


def invoke_white_skill(
    state: str,
    *,
    label: str,
    params: WhiteParams,
    model: str,
    fps: int = 24,
    height: int = 0,
    crf: int = 22,
    defringe_strength: float = 0.35,
) -> tuple[Path, Path]:
    if not WHITE_SKILL_PYTHON.exists():
        raise FileNotFoundError(f"Missing white-skill python: {WHITE_SKILL_PYTHON}")
    if not WHITE_SKILL_SCRIPT.exists():
        raise FileNotFoundError(f"Missing white-skill script: {WHITE_SKILL_SCRIPT}")

    source = pb2.source_video(state)
    output = white_skill_output_path(state, label)
    workdir = state_workdir(state, label)
    output.parent.mkdir(parents=True, exist_ok=True)
    workdir.mkdir(parents=True, exist_ok=True)
    env = os_environ_with_shared_model_cache(workdir, model)
    crop_preset = pb2.source_info(state)["cropPreset"] or "none"
    crop_filters = pb2.crop_filters(crop_preset) if crop_preset != "none" else []
    crop_filter = crop_filters[0] if crop_filters else None
    command = [
        str(WHITE_SKILL_PYTHON),
        str(WHITE_SKILL_SCRIPT),
        "--input",
        str(source),
        "--output",
        str(output),
        "--workdir",
        str(workdir),
        "--fps",
        str(fps),
        "--height",
        str(height),
        "--model",
        model,
        "--crf",
        str(crf),
        "--alpha-expand",
        str(params.alpha_expand),
        "--alpha-blur",
        str(params.alpha_blur),
        "--erode-size",
        str(params.erode_size),
        "--defringe-strength",
        str(defringe_strength),
        "--resume",
        "true",
        "--make-preview",
        "true",
    ]
    if crop_filter:
        command.extend(["--crop", crop_filter])
    run(
        command,
        env=env,
    )
    copy_raw_skill_samples(state, workdir)
    return output, workdir


def os_environ_with_shared_model_cache(workdir: Path, model: str) -> dict[str, str]:
    model_cache = workdir / "model_cache"
    model_cache.mkdir(parents=True, exist_ok=True)
    target = model_cache / model_cache_filename(model)

    for shared_model in (SLEEP_SHARED_MODEL_CACHE, LEGACY_SHARED_MODEL_CACHE):
        if not shared_model.exists():
            continue
        model_path = shared_model / model_cache_filename(model)
        if not model_path.exists() or target.exists():
            continue
        try:
            target.symlink_to(model_path)
        except FileExistsError:
            pass
        except OSError:
            shutil.copy2(model_path, target)

    env = os.environ.copy()
    env["U2NET_HOME"] = str(model_cache)
    return env


def write_alpha_contact_sheet_custom(ffmpeg: str, webm: Path, output: Path) -> None:
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


def write_preview_qa_bundle(ffmpeg: str, state: str, webm: Path, qa_dir: Path) -> None:
    qa_dir.mkdir(parents=True, exist_ok=True)
    pb2.write_overlay_contact_sheet(ffmpeg, state, webm, "white", qa_dir / f"{state}_contact.png")
    pb2.write_overlay_contact_sheet(ffmpeg, state, webm, "magenta", qa_dir / f"{state}_magenta.png")
    pb2.write_overlay_contact_sheet(ffmpeg, state, webm, "black", qa_dir / f"{state}_black.png")
    pb2.write_overlay_contact_sheet(ffmpeg, state, webm, "gray", qa_dir / f"{state}_gray.png")
    write_alpha_contact_sheet_custom(ffmpeg, webm, qa_dir / f"{state}_alpha.png")


def project_white_output(state: str, input_webm: Path, output_webm: Path, crf: int = 32) -> Path:
    ffmpeg = pb2.resolve_tool("ffmpeg", None)
    output = output_webm
    output.parent.mkdir(parents=True, exist_ok=True)
    bbox = measure_alpha_bbox(state, input_webm)
    if bbox is None:
        raise RuntimeError(f"Unable to measure alpha bbox for {state}: {input_webm}")
    run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-c:v",
            "libvpx-vp9",
            "-i",
            str(input_webm),
            "-vf",
            pb2.layout_transform_filter(state, bbox),
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


def update_duration_ms(state: str, webm: Path) -> int:
    _, duration_ms = ffprobe_duration_ms(webm)
    payload = load_states_config()
    motions = payload.get("motions")
    if not isinstance(motions, dict) or state not in motions:
        raise KeyError(f"State not found in states config: {state}")
    motion = motions[state]
    if not isinstance(motion, dict):
        raise TypeError(f"Unexpected motion config for {state}")
    motion["durationMs"] = duration_ms
    save_states_config(payload)
    return duration_ms


def asset_check_strict() -> None:
    run(["python3", "scripts/asset_check.py", "--webm-strict"])


def preview_state(
    state: str,
    *,
    label: str,
    params: WhiteParams | None = None,
    model: str | None = None,
    project_only: bool = False,
    raw_webm: Path | None = None,
) -> dict[str, object]:
    params = params or white_params_for_state(state)
    resolved_model = model or preferred_model_for_state(state)
    raw_output: Path
    workdir = state_workdir(state, label)
    if project_only:
        if raw_webm is None:
            raise ValueError("project_only requires --raw-webm")
        raw_output = raw_webm.resolve()
    else:
        raw_output, workdir = invoke_white_skill(state, label=label, params=params, model=resolved_model)

    preview_output = projected_preview_output_path(state, label)
    final_output = project_white_output(state, raw_output, output_webm=preview_output)
    ffmpeg = pb2.resolve_tool("ffmpeg", None)
    write_preview_qa_bundle(ffmpeg, state, final_output, workdir / "qa_runtime")
    duration_s, duration_ms = ffprobe_duration_ms(final_output)
    return {
        "state": state,
        "raw_webm": str(raw_output),
        "workdir": str(workdir),
        "preview_webm": str(final_output),
        "qa_runtime_dir": str(workdir / "qa_runtime"),
        "duration_s": duration_s,
        "duration_ms": duration_ms,
        "model": resolved_model,
        "white_params": {
            "alpha_expand": params.alpha_expand,
            "alpha_blur": params.alpha_blur,
            "erode_size": params.erode_size,
        },
    }


def finalize_state(state: str, projected_webm: Path) -> dict[str, object]:
    ffmpeg = pb2.resolve_tool("ffmpeg", None)
    final_webm = pb2.output_webm(state)
    final_webm.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(projected_webm, final_webm)
    pb2.write_contact_sheet(ffmpeg, state, final_webm)
    keyframe = pb2.write_fallback_keyframe(ffmpeg, state, final_webm)
    duration_s, duration_ms = ffprobe_duration_ms(final_webm)
    update_duration_ms(state, final_webm)
    asset_check_strict()
    return {
        "state": state,
        "final_webm": str(final_webm),
        "fallback_keyframe": str(keyframe),
        "duration_s": duration_s,
        "duration_ms": duration_ms,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Refresh runtime states with white-bg-video-matting and runtime projection."
    )
    parser.add_argument("--state", choices=QUEUE, required=True)
    parser.add_argument("--label", default="runtime_white_refresh")
    parser.add_argument("--alpha-expand", type=int)
    parser.add_argument("--alpha-blur", type=float)
    parser.add_argument("--erode-size", type=int)
    parser.add_argument("--model", help="Override rembg model name.")
    parser.add_argument("--mode", choices=("preview", "finalize"), default="preview")
    parser.add_argument("--project-only", action="store_true")
    parser.add_argument("--raw-webm", help="Existing raw transparent WebM to project.")
    parser.add_argument("--projected-webm", help="Projected runtime preview WebM to finalize.")
    parser.add_argument("--print-defaults", action="store_true")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    defaults = white_params_for_state(args.state)
    if args.print_defaults:
        print(
            json.dumps(
                {
                    "state": args.state,
                    "mattePreset": pb2.source_info(args.state)["mattePreset"],
                    "model": preferred_model_for_state(args.state),
                    "whiteParams": {
                        "alpha_expand": defaults.alpha_expand,
                        "alpha_blur": defaults.alpha_blur,
                        "erode_size": defaults.erode_size,
                    },
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    params = WhiteParams(
        alpha_expand=args.alpha_expand if args.alpha_expand is not None else defaults.alpha_expand,
        alpha_blur=args.alpha_blur if args.alpha_blur is not None else defaults.alpha_blur,
        erode_size=args.erode_size if args.erode_size is not None else defaults.erode_size,
    )
    if args.mode == "preview":
        result = preview_state(
            args.state,
            label=args.label,
            params=params,
            model=args.model,
            project_only=args.project_only,
            raw_webm=Path(args.raw_webm) if args.raw_webm else None,
        )
    else:
        projected = Path(args.projected_webm).resolve() if args.projected_webm else projected_preview_output_path(args.state, args.label)
        result = finalize_state(args.state, projected)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
