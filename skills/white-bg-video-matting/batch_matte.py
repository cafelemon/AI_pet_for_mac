from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Sequence

from matting_video import MattingConfig, MattingError, build_default_workdir, ensure_odd, parse_bool, process_video


VIDEO_EXTENSIONS = {".mp4", ".mov"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Batch convert white-background pet videos into transparent WebM.")
    parser.add_argument("--input-dir", required=True, help="Directory containing input MP4/MOV files.")
    parser.add_argument("--output-dir", required=True, help="Directory for output WebM files.")
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--crf", type=int, default=22)
    parser.add_argument("--alpha-expand", type=lambda x: ensure_odd(int(x), "--alpha-expand"), default=3)
    parser.add_argument("--alpha-blur", type=float, default=0.6)
    parser.add_argument("--erode-size", type=lambda x: ensure_odd(int(x), "--erode-size"), default=5)
    parser.add_argument("--make-preview", type=parse_bool, default=True)
    parser.add_argument("--keep-frames", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--defringe-strength", type=float, default=0.35)
    return parser


def collect_inputs(input_dir: Path) -> list[Path]:
    return sorted(path for path in input_dir.iterdir() if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS)


def process_batch(argv: Sequence[str] | None = None) -> dict[str, Any]:
    args = build_parser().parse_args(argv)
    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_dir.exists():
        raise MattingError(f"Input directory does not exist: {input_dir}")

    inputs = collect_inputs(input_dir)
    batch_report: dict[str, Any] = {
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "started_at": int(time.time()),
        "total": len(inputs),
        "success_count": 0,
        "failure_count": 0,
        "items": [],
    }

    for input_path in inputs:
        output_path = output_dir / f"{input_path.stem}.webm"
        workdir = build_default_workdir(input_path)
        config = MattingConfig(
            input_path=input_path,
            output_path=output_path,
            workdir=workdir,
            fps=args.fps,
            height=args.height,
            model=args.model,
            crf=args.crf,
            alpha_expand=args.alpha_expand,
            alpha_blur=args.alpha_blur,
            erode_size=args.erode_size,
            make_preview=args.make_preview,
            keep_frames=args.keep_frames,
            dry_run=args.dry_run,
            defringe_strength=args.defringe_strength,
        )

        try:
            item_report = process_video(config)
            batch_report["success_count"] += 1
            batch_report["items"].append(item_report)
        except Exception as exc:  # noqa: BLE001
            batch_report["failure_count"] += 1
            batch_report["items"].append(
                {
                    "input": str(input_path),
                    "output": str(output_path),
                    "workdir": str(workdir),
                    "success": False,
                    "error": str(exc),
                }
            )

    batch_report["finished_at"] = int(time.time())
    report_path = output_dir / "batch_report.json"
    with report_path.open("w", encoding="utf-8") as handle:
        json.dump(batch_report, handle, ensure_ascii=False, indent=2)
    return batch_report


def main(argv: Sequence[str] | None = None) -> int:
    try:
        report = process_batch(argv)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["failure_count"] == 0 else 2
    except MattingError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
