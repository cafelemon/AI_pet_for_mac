#!/usr/bin/env python3
"""Tint near-white coding furniture away from the white backdrop."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "assets" / "states" / "coding" / "source" / "coding_jimeng.mp4"
DEFAULT_OUTPUT = ROOT / "assets" / "states" / "coding" / "source" / "coding_jimeng_recolored.mp4"


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


def build_filter() -> str:
    # Recolor only the light furniture area while preserving the white backdrop.
    # The desk/chair live in the lower-left / lower-middle region and are much
    # warmer and darker than the background after recoloring.
    box = "gte(X,35)*lte(X,1110)*gte(Y,700)*lte(Y,1715)"
    rgb_min = "min(min(r(X,Y),g(X,Y)),b(X,Y))"
    rgb_max = "max(max(r(X,Y),g(X,Y)),b(X,Y))"
    rgb_range = f"{rgb_max}-{rgb_min}"
    near_white = f"gte({rgb_min},178)*lte({rgb_range},42)"
    not_background = "lt(alpha(X,Y),250)+lt(Y,760)"
    furniture = f"gt(({box})*({near_white})*(1-gt({not_background},0)),0)"
    return (
        "format=rgba,"
        "geq="
        f"r='if({furniture},214,r(X,Y))':"
        f"g='if({furniture},206,g(X,Y))':"
        f"b='if({furniture},196,b(X,Y))':"
        "a='alpha(X,Y)'"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Recolor the coding source furniture.")
    parser.add_argument("--input", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    source = args.input.resolve()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(source),
            "-vf",
            f"{build_filter()},format=yuv420p",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output),
        ]
    )

    print(output.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
