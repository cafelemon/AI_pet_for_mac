#!/usr/bin/env python3
"""Validate PA0 keyframes and optional PB1 WebM loop assets."""

from __future__ import annotations

import argparse
import re
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KEYFRAME_ROOT = ROOT / "assets" / "keyframes"
WEBM_ROOT = ROOT / "assets" / "webm"
CANVAS_SIZE = (1536, 1728)
BASE_STATES = (
    "idle",
    "coding",
    "thinking",
    "success",
    "error",
    "reminder",
    "sleep",
)
IDLE_VARIANTS = (
    "idle_reading",
    "idle_yawn",
    "idle_hair",
)
KEYFRAME_FOLDERS = BASE_STATES + IDLE_VARIANTS
NAME_PATTERN = re.compile(r"^(?P<state>[a-z_]+)_(?P<index>\d{2})\.(png|webp)$")
WEBM_NAME_PATTERN = re.compile(r"^(?P<state>[a-z_]+)_loop\.webm$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def read_png_info(path: Path) -> tuple[int, int, bool]:
    with path.open("rb") as handle:
        if handle.read(8) != PNG_SIGNATURE:
            raise ValueError("not a PNG file")
        while True:
            length_bytes = handle.read(4)
            if len(length_bytes) != 4:
                raise ValueError("missing PNG IHDR chunk")
            length = struct.unpack(">I", length_bytes)[0]
            chunk_type = handle.read(4)
            data = handle.read(length)
            handle.read(4)
            if chunk_type == b"IHDR":
                width, height, bit_depth, color_type = struct.unpack(">IIBB", data[:10])
                return width, height, color_type in {4, 6}
            if chunk_type == b"IEND":
                raise ValueError("missing PNG IHDR chunk")


def check_webm_assets(webm_strict: bool, failures: list[str], warnings: list[str]) -> None:
    if not WEBM_ROOT.exists():
        message = f"missing PB1 WebM root: {WEBM_ROOT.relative_to(ROOT)}"
        if webm_strict:
            failures.append(message)
        return

    for folder in KEYFRAME_FOLDERS:
        state_dir = WEBM_ROOT / folder
        expected_loop = state_dir / f"{folder}_loop.webm"

        if not state_dir.exists():
            if webm_strict:
                failures.append(f"missing PB1 WebM directory: {state_dir.relative_to(ROOT)}")
            continue
        if not state_dir.is_dir():
            failures.append(f"PB1 WebM path is not a directory: {state_dir.relative_to(ROOT)}")
            continue

        webms = sorted(path for path in state_dir.iterdir() if path.suffix.lower() == ".webm")
        if webm_strict and expected_loop not in webms:
            failures.append(f"missing PB1 loop WebM: {expected_loop.relative_to(ROOT)}")

        for webm in webms:
            match = WEBM_NAME_PATTERN.match(webm.name)
            if not match or match.group("state") != folder:
                failures.append(f"invalid PB1 WebM name: {webm.relative_to(ROOT)}")
                continue
            if webm.stat().st_size == 0:
                failures.append(f"empty PB1 WebM asset: {webm.relative_to(ROOT)}")

    for directory in sorted(path for path in WEBM_ROOT.iterdir() if path.is_dir()):
        if directory.name not in KEYFRAME_FOLDERS:
            warnings.append(f"unexpected PB1 WebM directory: {directory.relative_to(ROOT)}")


def check_assets(strict: bool, webm_strict: bool) -> int:
    failures: list[str] = []
    warnings: list[str] = []

    for folder in KEYFRAME_FOLDERS:
        state_dir = KEYFRAME_ROOT / folder
        if not state_dir.is_dir():
            failures.append(f"missing directory: {state_dir.relative_to(ROOT)}")
            continue

        keyframes = sorted(
            path for path in state_dir.iterdir() if path.suffix.lower() in {".png", ".webp"}
        )
        if not keyframes:
            message = f"no keyframes found: {state_dir.relative_to(ROOT)}"
            if strict:
                failures.append(message)
            else:
                warnings.append(message)
            continue

        for keyframe in keyframes:
            match = NAME_PATTERN.match(keyframe.name)
            if not match or match.group("state") != folder:
                failures.append(f"invalid keyframe name: {keyframe.relative_to(ROOT)}")
                continue

            if strict and keyframe.suffix.lower() == ".png":
                try:
                    width, height, has_alpha = read_png_info(keyframe)
                except ValueError as exc:
                    failures.append(f"invalid PNG: {keyframe.relative_to(ROOT)} ({exc})")
                    continue

                if (width, height) != CANVAS_SIZE:
                    failures.append(
                        "invalid PNG size: "
                        f"{keyframe.relative_to(ROOT)} is {width}x{height}, "
                        f"expected {CANVAS_SIZE[0]}x{CANVAS_SIZE[1]}"
                    )
                if not has_alpha:
                    failures.append(f"missing PNG alpha channel: {keyframe.relative_to(ROOT)}")

    for directory in sorted(path for path in KEYFRAME_ROOT.iterdir() if path.is_dir()):
        if directory.name not in KEYFRAME_FOLDERS:
            warnings.append(f"unexpected keyframe directory: {directory.relative_to(ROOT)}")

    check_webm_assets(webm_strict, failures, warnings)

    for warning in warnings:
        print(f"WARN: {warning}")
    for failure in failures:
        print(f"FAIL: {failure}")

    if failures:
        return 1

    print("PA0/PB1 asset layout check passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate PA0 keyframe assets.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Require at least one PNG/WebP keyframe in every state directory.",
    )
    parser.add_argument(
        "--webm-strict",
        action="store_true",
        help="Require a non-empty PB1 <state>_loop.webm file in every render folder.",
    )
    args = parser.parse_args()
    return check_assets(strict=args.strict, webm_strict=args.webm_strict)


if __name__ == "__main__":
    raise SystemExit(main())
