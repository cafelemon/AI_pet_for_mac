from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Sequence

try:
    from requests.exceptions import RequestException
except ImportError:
    class RequestException(Exception):
        """Fallback request exception when requests is unavailable."""

try:
    import numpy as np
except ImportError:
    np = None  # type: ignore[assignment]

try:
    from PIL import Image, ImageFilter
except ImportError:
    Image = None  # type: ignore[assignment]
    ImageFilter = None  # type: ignore[assignment]

try:
    from rembg import new_session, remove
except ImportError:
    new_session = None  # type: ignore[assignment]
    remove = None  # type: ignore[assignment]

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(iterable: Any, **_: Any) -> Any:
        return iterable


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm"}


class MattingError(RuntimeError):
    """Raised when video matting cannot proceed."""


@dataclass
class VideoInfo:
    width: int
    height: int
    duration: float
    fps: float
    frame_count: int | None
    codec_name: str | None
    pix_fmt: str | None


@dataclass
class MattingConfig:
    input_path: Path
    output_path: Path
    workdir: Path
    fps: int
    height: int
    crop_filter: str | None
    model: str
    crf: int
    alpha_expand: int
    alpha_blur: float
    erode_size: int
    make_preview: bool
    keep_frames: bool
    resume: bool
    dry_run: bool
    defringe_strength: float = 0.35


def ensure_python_dependencies() -> None:
    missing: list[str] = []
    if np is None:
        missing.append("numpy")
    if Image is None or ImageFilter is None:
        missing.append("pillow")
    if new_session is None or remove is None:
        missing.append("rembg")
    if missing:
        raise MattingError(
            "Missing Python dependencies: "
            + ", ".join(missing)
            + ". Activate the skill virtualenv and run `pip install -r requirements.txt`."
        )


def parse_bool(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in {"1", "true", "yes", "y", "on"}:
        return True
    if lowered in {"0", "false", "no", "n", "off"}:
        return False
    raise argparse.ArgumentTypeError(f"Invalid boolean value: {value}")


def ensure_odd(value: int, arg_name: str) -> int:
    if value < 1 or value % 2 == 0:
        raise argparse.ArgumentTypeError(f"{arg_name} must be a positive odd integer.")
    return value


def run_command(command: Sequence[str], *, dry_run: bool = False) -> None:
    printable = " ".join(command)
    print(f"[cmd] {printable}")
    if dry_run:
        return
    subprocess.run(command, check=True)


def check_binary(name: str) -> None:
    if shutil.which(name) is None:
        raise MattingError(
            f"Missing dependency: {name}. Please install ffmpeg tools first, "
            f"for example with `brew install ffmpeg`."
        )


def probe_video(input_path: Path) -> VideoInfo:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        str(input_path),
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    payload = json.loads(result.stdout)
    stream = next((item for item in payload.get("streams", []) if item.get("codec_type") == "video"), None)
    if not stream:
        raise MattingError(f"No video stream found in {input_path}")

    width = int(stream["width"])
    height = int(stream["height"])
    duration = float(stream.get("duration") or payload.get("format", {}).get("duration") or 0.0)
    fps = parse_fraction(stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0/1")

    frame_count: int | None = None
    if stream.get("nb_frames"):
        try:
            frame_count = int(stream["nb_frames"])
        except ValueError:
            frame_count = None

    if frame_count is None and duration > 0 and fps > 0:
        frame_count = max(1, int(round(duration * fps)))

    return VideoInfo(
        width=width,
        height=height,
        duration=duration,
        fps=fps,
        frame_count=frame_count,
        codec_name=stream.get("codec_name"),
        pix_fmt=stream.get("pix_fmt"),
    )


def parse_fraction(value: str) -> float:
    if "/" in value:
        numerator, denominator = value.split("/", 1)
        denominator_value = float(denominator)
        if denominator_value == 0:
            return 0.0
        return float(numerator) / denominator_value
    return float(value)


def validate_config(config: MattingConfig) -> None:
    check_binary("ffmpeg")
    check_binary("ffprobe")

    if not config.input_path.exists():
        raise MattingError(f"Input file does not exist: {config.input_path}")
    if config.input_path.suffix.lower() not in VIDEO_EXTENSIONS:
        raise MattingError("Input must be one of: .mp4, .mov, .webm")

    config.output_path.parent.mkdir(parents=True, exist_ok=True)
    if not config.output_path.parent.exists():
        raise MattingError(f"Unable to prepare output directory: {config.output_path.parent}")
    if not os_writable(config.output_path.parent):
        raise MattingError(f"Output directory is not writable: {config.output_path.parent}")

    if config.height < 0:
        raise MattingError("--height must be 0 or a positive integer")
    if config.fps <= 0:
        raise MattingError("--fps must be greater than 0")
    if config.crf < 0:
        raise MattingError("--crf must be greater than or equal to 0")
    if config.alpha_blur < 0:
        raise MattingError("--alpha-blur must be greater than or equal to 0")
    if not (0.0 <= config.defringe_strength <= 1.0):
        raise MattingError("--defringe-strength must be within 0.0 to 1.0")


def os_writable(path: Path) -> bool:
    try:
        probe = path / ".write_test_tmp"
        with probe.open("w", encoding="utf-8") as handle:
            handle.write("ok")
        probe.unlink()
        return True
    except OSError:
        return False


def build_default_workdir(input_path: Path) -> Path:
    return input_path.parent / ".matting_work" / input_path.stem


def configure_model_cache(workdir: Path) -> Path:
    cache_dir = workdir / "model_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("U2NET_HOME", str(cache_dir))
    return cache_dir


def extract_frames(config: MattingConfig, frames_dir: Path) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    existing_frames = sorted(frames_dir.glob("frame_*.png"))
    if config.resume and existing_frames:
        print(f"[resume] Reusing {len(existing_frames)} extracted frames from {frames_dir}")
        return existing_frames

    vf_parts: list[str] = []
    if config.crop_filter:
        vf_parts.append(config.crop_filter)
    vf_parts.append(f"fps={config.fps}")
    if config.height > 0:
        vf_parts.append(f"scale=-2:{config.height}")
    vf_expr = ",".join(vf_parts)

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(config.input_path),
        "-vf",
        vf_expr,
        str(frames_dir / "frame_%05d.png"),
    ]
    run_command(command, dry_run=config.dry_run)

    if config.dry_run:
        return []
    return sorted(frames_dir.glob("frame_*.png"))


def refine_alpha(image: Image.Image, expand: int, blur: float) -> Image.Image:
    ensure_python_dependencies()
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    if expand >= 3:
        alpha = alpha.filter(ImageFilter.MaxFilter(expand))
    if blur > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(radius=blur))
    rgba.putalpha(alpha)
    return rgba


def defringe_white(image: Image.Image, strength: float = 0.35) -> Image.Image:
    ensure_python_dependencies()
    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    rgb = rgba[..., :3].astype(np.float32)
    alpha = rgba[..., 3].astype(np.float32)

    edge_mask = (alpha > 0) & (alpha < 255)
    if not np.any(edge_mask):
        return image

    whiteness = rgb.min(axis=2)
    bright_edge = edge_mask & (whiteness >= 220)
    if not np.any(bright_edge):
        return image

    alpha_ratio = alpha / 255.0
    attenuation = np.clip((whiteness - 220.0) / 35.0, 0.0, 1.0) * strength
    attenuation *= np.clip(1.0 - alpha_ratio, 0.0, 1.0)

    scale = 1.0 - attenuation[..., None]
    rgb[bright_edge] = np.clip(rgb[bright_edge] * scale[bright_edge], 0.0, 255.0)
    rgba[..., :3] = rgb.astype(np.uint8)
    return Image.fromarray(rgba, mode="RGBA")


def matte_frame(
    input_frame: Path,
    output_frame: Path,
    session: Any,
    *,
    expand: int,
    blur: float,
    erode_size: int,
    defringe_strength: float,
) -> None:
    ensure_python_dependencies()
    image = Image.open(input_frame).convert("RGBA")
    result = remove(
        image,
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=erode_size,
    )
    rgba = result if isinstance(result, Image.Image) else Image.open(result).convert("RGBA")
    refined = refine_alpha(rgba, expand, blur)
    defringed = defringe_white(refined, strength=defringe_strength)
    output_frame.parent.mkdir(parents=True, exist_ok=True)
    defringed.save(output_frame)


def composite_preview_frame(image: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    ensure_python_dependencies()
    base = Image.new("RGBA", image.size, background + (255,))
    composed = Image.alpha_composite(base, image.convert("RGBA"))
    return composed.convert("RGB")


def render_preview_video(
    alpha_frames_dir: Path,
    output_path: Path,
    fps: int,
    background: tuple[int, int, int],
    dry_run: bool,
) -> None:
    composite_dir = output_path.parent / f".{output_path.stem}_frames"
    if not dry_run:
        composite_dir.mkdir(parents=True, exist_ok=True)
        for frame_path in sorted(alpha_frames_dir.glob("frame_*.png")):
            image = Image.open(frame_path).convert("RGBA")
            composite = composite_preview_frame(image, background)
            composite.save(composite_dir / frame_path.name)

    command = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(fps),
        "-i",
        str(composite_dir / "frame_%05d.png"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(output_path),
    ]
    run_command(command, dry_run=dry_run)

    if not dry_run and composite_dir.exists():
        shutil.rmtree(composite_dir, ignore_errors=True)


def create_checkerboard(size: tuple[int, int], tile: int = 24) -> Image.Image:
    ensure_python_dependencies()
    width, height = size
    light = (208, 208, 208)
    dark = (150, 150, 150)
    canvas = Image.new("RGB", size, light)
    pixels = canvas.load()
    for y in range(height):
        for x in range(width):
            if ((x // tile) + (y // tile)) % 2:
                pixels[x, y] = dark
    return canvas


def save_sample_frames(alpha_frames: list[Path], target_dir: Path) -> dict[str, str]:
    target_dir.mkdir(parents=True, exist_ok=True)
    if not alpha_frames:
        return {}
    indices = {
        "first": 0,
        "middle": len(alpha_frames) // 2,
        "last": len(alpha_frames) - 1,
    }
    output: dict[str, str] = {}
    for name, idx in indices.items():
        source = alpha_frames[idx]
        target = target_dir / f"{name}.png"
        shutil.copy2(source, target)
        output[name] = str(target)
    return output


def make_preview_grid(alpha_frames: list[Path], output_path: Path) -> None:
    ensure_python_dependencies()
    if not alpha_frames:
        return
    sample_count = min(12, len(alpha_frames))
    sample_indexes = np.linspace(0, len(alpha_frames) - 1, sample_count, dtype=int).tolist()
    images = [Image.open(alpha_frames[idx]).convert("RGBA") for idx in sample_indexes]
    thumb_width = 240
    rendered: list[Image.Image] = []
    for image in images:
        checker = create_checkerboard(image.size)
        preview = Image.alpha_composite(checker.convert("RGBA"), image).convert("RGB")
        ratio = thumb_width / preview.width
        thumb_height = max(1, int(round(preview.height * ratio)))
        rendered.append(preview.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS))

    cols = 3
    rows = math.ceil(len(rendered) / cols)
    cell_height = max(item.height for item in rendered)
    grid = Image.new("RGB", (cols * thumb_width, rows * cell_height), (32, 32, 32))

    for idx, image in enumerate(rendered):
        x = (idx % cols) * thumb_width
        y = (idx // cols) * cell_height
        grid.paste(image, (x, y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    grid.save(output_path, quality=92)


def encode_alpha_webm(alpha_frames_dir: Path, output_path: Path, fps: int, crf: int, dry_run: bool) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(fps),
        "-i",
        str(alpha_frames_dir / "frame_%05d.png"),
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
        "-an",
        str(output_path),
    ]
    run_command(command, dry_run=dry_run)


def collect_output_video_info(output_path: Path) -> dict[str, Any]:
    if not output_path.exists():
        return {}
    info = probe_video(output_path)
    return asdict(info)


def process_video(config: MattingConfig) -> dict[str, Any]:
    validate_config(config)
    ensure_python_dependencies()
    video_info = probe_video(config.input_path)
    report_path = config.workdir / "report.json"
    model_cache_dir = configure_model_cache(config.workdir)

    report: dict[str, Any] = {
        "input": str(config.input_path),
        "output": str(config.output_path),
        "workdir": str(config.workdir),
        "config": {
            "fps": config.fps,
            "height": config.height,
            "crop_filter": config.crop_filter,
            "model": config.model,
            "crf": config.crf,
            "alpha_expand": config.alpha_expand,
            "alpha_blur": config.alpha_blur,
            "erode_size": config.erode_size,
            "make_preview": config.make_preview,
            "keep_frames": config.keep_frames,
            "resume": config.resume,
            "dry_run": config.dry_run,
            "defringe_strength": config.defringe_strength,
            "model_cache_dir": str(model_cache_dir),
        },
        "input_video": asdict(video_info),
        "frame_count": 0,
        "success": False,
        "warnings": [],
        "qa_outputs": {},
        "output_video": {},
        "started_at": int(time.time()),
    }

    if config.dry_run:
        report["warnings"].append("Dry run only; no frames or videos were rendered.")
        report["success"] = True
        config.workdir.mkdir(parents=True, exist_ok=True)
        with report_path.open("w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
        return report

    config.workdir.mkdir(parents=True, exist_ok=True)
    frames_dir = config.workdir / "frames"
    alpha_frames_dir = config.workdir / "alpha_frames"
    qa_dir = config.workdir / "qa"

    try:
        frame_paths = extract_frames(config, frames_dir)
        if not frame_paths:
            raise MattingError("No frames were extracted from the input video.")

        report["frame_count"] = len(frame_paths)
        try:
            session = new_session(config.model)
        except RequestException as exc:
            raise MattingError(
                f"Failed to download rembg model '{config.model}'. "
                f"Please allow network access for the first run or pre-populate "
                f"{model_cache_dir} with the model file."
            ) from exc

        alpha_frames_dir.mkdir(parents=True, exist_ok=True)
        resumed_alpha_frames = 0
        for frame_path in tqdm(frame_paths, desc="AI matting", unit="frame"):
            output_frame = alpha_frames_dir / frame_path.name
            if config.resume and output_frame.exists() and output_frame.stat().st_size > 0:
                resumed_alpha_frames += 1
                continue
            matte_frame(
                frame_path,
                output_frame,
                session,
                expand=config.alpha_expand,
                blur=config.alpha_blur,
                erode_size=config.erode_size,
                defringe_strength=config.defringe_strength,
            )
        if resumed_alpha_frames:
            report["warnings"].append(
                f"Resumed from {resumed_alpha_frames} existing alpha frames in {alpha_frames_dir}."
            )

        encode_alpha_webm(alpha_frames_dir, config.output_path, config.fps, config.crf, config.dry_run)

        alpha_frame_paths = sorted(alpha_frames_dir.glob("frame_*.png"))
        report["qa_outputs"]["sample_frames"] = save_sample_frames(alpha_frame_paths, qa_dir / "sample_frames")
        if config.make_preview:
            render_preview_video(
                alpha_frames_dir,
                qa_dir / "preview_black.mp4",
                config.fps,
                background=(0, 0, 0),
                dry_run=False,
            )
            render_preview_video(
                alpha_frames_dir,
                qa_dir / "preview_gray.mp4",
                config.fps,
                background=(128, 128, 128),
                dry_run=False,
            )
            make_preview_grid(alpha_frame_paths, qa_dir / "preview_grid.jpg")
            report["qa_outputs"].update(
                {
                    "preview_black": str(qa_dir / "preview_black.mp4"),
                    "preview_gray": str(qa_dir / "preview_gray.mp4"),
                    "preview_grid": str(qa_dir / "preview_grid.jpg"),
                }
            )

        report["output_video"] = collect_output_video_info(config.output_path)
        report["success"] = True
        return report
    except Exception as exc:
        report["success"] = False
        report["error"] = str(exc)
        raise
    finally:
        if report["success"] and not config.keep_frames:
            shutil.rmtree(frames_dir, ignore_errors=True)
            shutil.rmtree(alpha_frames_dir, ignore_errors=True)
            report["warnings"].append("Intermediate frames were removed because keep_frames=false.")
        report["finished_at"] = int(time.time())
        with report_path.open("w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
    


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert white-background pet videos into transparent VP9 WebM.")
    parser.add_argument("--input", required=True, help="Input MP4/MOV/WebM file.")
    parser.add_argument("--output", required=True, help="Output transparent WebM path.")
    parser.add_argument("--workdir", help="Work directory for extracted and alpha frames.")
    parser.add_argument("--fps", type=int, default=24, help="Output frames per second.")
    parser.add_argument("--height", type=int, default=768, help="Scaled output height, or 0 to keep original size.")
    parser.add_argument("--crop", help="Optional ffmpeg crop filter, for example crop=944:1072:488:4.")
    parser.add_argument("--model", default="isnet-general-use", help="rembg model name.")
    parser.add_argument("--crf", type=int, default=22, help="VP9 CRF quality.")
    parser.add_argument("--alpha-expand", type=lambda x: ensure_odd(int(x), "--alpha-expand"), default=3)
    parser.add_argument("--alpha-blur", type=float, default=0.6, help="Gaussian blur radius applied to alpha.")
    parser.add_argument("--erode-size", type=lambda x: ensure_odd(int(x), "--erode-size"), default=5)
    parser.add_argument("--make-preview", type=parse_bool, default=True, help="Whether to generate QA previews.")
    parser.add_argument("--keep-frames", action="store_true", help="Keep extracted and alpha frame directories.")
    parser.add_argument("--resume", type=parse_bool, default=True, help="Reuse existing extracted/alpha frames in workdir when available.")
    parser.add_argument("--dry-run", action="store_true", help="Validate dependencies and arguments without processing.")
    parser.add_argument(
        "--defringe-strength",
        type=float,
        default=0.35,
        help="Conservative white-edge suppression strength from 0.0 to 1.0.",
    )
    return parser


def parse_args(argv: Sequence[str] | None = None) -> MattingConfig:
    parser = build_parser()
    args = parser.parse_args(argv)

    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    workdir = Path(args.workdir).expanduser().resolve() if args.workdir else build_default_workdir(input_path)

    return MattingConfig(
        input_path=input_path,
        output_path=output_path,
        workdir=workdir,
        fps=args.fps,
        height=args.height,
        crop_filter=args.crop,
        model=args.model,
        crf=args.crf,
        alpha_expand=args.alpha_expand,
        alpha_blur=args.alpha_blur,
        erode_size=args.erode_size,
        make_preview=args.make_preview,
        keep_frames=args.keep_frames,
        resume=args.resume,
        dry_run=args.dry_run,
        defringe_strength=args.defringe_strength,
    )


def main(argv: Sequence[str] | None = None) -> int:
    try:
        config = parse_args(argv)
        report = process_video(config)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except MattingError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as exc:
        print(f"[error] Command failed with exit code {exc.returncode}: {exc.cmd}", file=sys.stderr)
        return exc.returncode or 1
    except Exception as exc:  # noqa: BLE001
        print(f"[error] Unexpected failure: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
