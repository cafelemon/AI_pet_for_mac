#!/usr/bin/env python3
"""Validate action-registry keyframes and transparent WebM loop assets."""

from __future__ import annotations

import argparse
import json
import re
import struct
from pathlib import Path

import action_registry


ROOT = Path(__file__).resolve().parents[1]
STATES_CONFIG_PATH = ROOT / "data" / "config" / "states.config.json"
CANVAS_SIZE = (1536, 1728)
NAME_PATTERN = re.compile(r"^(?P<state>[a-z_]+)_(?P<index>\d{2})\.(png|webp)$")
WEBM_NAME_PATTERN = re.compile(r"^(?P<state>[a-z_]+)_loop\.webm$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def configured_render_actions() -> tuple[str, ...]:
    if not STATES_CONFIG_PATH.exists():
        return action_registry.action_ids()

    config = json.loads(STATES_CONFIG_PATH.read_text(encoding="utf-8"))
    action_ids = config.get("pa0KeyframeFolders")
    if not isinstance(action_ids, list):
        return action_registry.action_ids()
    return tuple(str(action_id) for action_id in action_ids)


def allowed_names(action: dict[str, object]) -> set[str]:
    names = {str(action["id"])}
    legacy_id = action.get("legacyId")
    if isinstance(legacy_id, str) and legacy_id:
        names.add(legacy_id)
    return names


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


def check_webm_assets(
    action_id: str,
    action: dict[str, object],
    webm_strict: bool,
    failures: list[str],
    warnings: list[str],
) -> None:
    expected_webm = action_registry.webm_path(action_id)
    webm_dir = expected_webm.parent
    is_available = bool(action.get("available"))

    if not webm_dir.exists():
        message = f"missing WebM directory: {webm_dir.relative_to(ROOT)}"
        if webm_strict and is_available:
            failures.append(message)
        else:
            warnings.append(message)
        return
    if not webm_dir.is_dir():
        failures.append(f"WebM path is not a directory: {webm_dir.relative_to(ROOT)}")
        return

    webms = sorted(path for path in webm_dir.iterdir() if path.suffix.lower() == ".webm")
    if webm_strict and is_available and expected_webm not in webms:
        failures.append(f"missing loop WebM: {expected_webm.relative_to(ROOT)}")

    names = allowed_names(action)
    for webm in webms:
        match = WEBM_NAME_PATTERN.match(webm.name)
        if not match or match.group("state") not in names:
            failures.append(f"invalid WebM name: {webm.relative_to(ROOT)}")
            continue
        if webm.stat().st_size == 0:
            failures.append(f"empty WebM asset: {webm.relative_to(ROOT)}")


def check_keyframes(
    action_id: str,
    action: dict[str, object],
    strict: bool,
    failures: list[str],
    warnings: list[str],
) -> None:
    keyframe_dir = action_registry.keyframe_dir(action_id)
    is_available = bool(action.get("available"))

    if not keyframe_dir.is_dir():
        message = f"missing keyframe directory: {keyframe_dir.relative_to(ROOT)}"
        if strict and is_available:
            failures.append(message)
        else:
            warnings.append(message)
        return

    keyframes = sorted(path for path in keyframe_dir.iterdir() if path.suffix.lower() in {".png", ".webp"})
    if not keyframes:
        message = f"no keyframes found: {keyframe_dir.relative_to(ROOT)}"
        if strict and is_available:
            failures.append(message)
        else:
            warnings.append(message)
        return

    names = allowed_names(action)
    for keyframe in keyframes:
        match = NAME_PATTERN.match(keyframe.name)
        if not match or match.group("state") not in names:
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


def check_assets(strict: bool, webm_strict: bool) -> int:
    failures: list[str] = []
    warnings: list[str] = []
    actions = action_registry.load_actions()

    for action_id in configured_render_actions():
        action = actions.get(action_id)
        if not action:
            failures.append(f"render action is missing from registry: {action_id}")
            continue
        if not action.get("runtime"):
            warnings.append(f"render action is not runtime-enabled: {action_id}")
            continue

        check_keyframes(action_id, action, strict, failures, warnings)
        check_webm_assets(action_id, action, webm_strict, failures, warnings)

    for warning in warnings:
        print(f"WARN: {warning}")
    for failure in failures:
        print(f"FAIL: {failure}")

    if failures:
        return 1

    print("Action registry asset layout check passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate action registry assets.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Require at least one PNG/WebP keyframe in every available runtime action directory.",
    )
    parser.add_argument(
        "--webm-strict",
        action="store_true",
        help="Require a non-empty loop WebM file for every available runtime action.",
    )
    args = parser.parse_args()
    return check_assets(strict=args.strict, webm_strict=args.webm_strict)


if __name__ == "__main__":
    raise SystemExit(main())
