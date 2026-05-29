#!/usr/bin/env python3
"""Write lightweight visual QA metrics for generated RGBA pet keyframes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:  # pragma: no cover - best effort metrics are still useful.
    cv2 = None


def morphology(mask: np.ndarray, operation: str, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask
    if cv2 is not None:
        kernel = np.ones((radius * 2 + 1, radius * 2 + 1), np.uint8)
        value = mask.astype(np.uint8) * 255
        if operation == "dilate":
            return cv2.dilate(value, kernel, iterations=1) > 0
        if operation == "erode":
            return cv2.erode(value, kernel, iterations=1) > 0
    from PIL import ImageFilter

    image = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    size = radius * 2 + 1
    if operation == "dilate":
        image = image.filter(ImageFilter.MaxFilter(size))
    elif operation == "erode":
        image = image.filter(ImageFilter.MinFilter(size))
    return np.array(image) > 0


def bbox_from_mask(mask: np.ndarray) -> dict[str, int] | None:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return {
        "x1": int(xs.min()),
        "y1": int(ys.min()),
        "x2": int(xs.max()),
        "y2": int(ys.max()),
        "width": int(xs.max() - xs.min() + 1),
        "height": int(ys.max() - ys.min() + 1),
    }


def main_component(mask: np.ndarray) -> dict[str, int] | None:
    if cv2 is None:
        box = bbox_from_mask(mask)
        if box is None:
            return None
        box["area"] = int(mask.sum())
        return box

    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count <= 1:
        return None
    component = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x = int(stats[component, cv2.CC_STAT_LEFT])
    y = int(stats[component, cv2.CC_STAT_TOP])
    width = int(stats[component, cv2.CC_STAT_WIDTH])
    height = int(stats[component, cv2.CC_STAT_HEIGHT])
    return {
        "x1": x,
        "y1": y,
        "x2": x + width - 1,
        "y2": y + height - 1,
        "width": width,
        "height": height,
        "area": int(stats[component, cv2.CC_STAT_AREA]),
    }


def write_watermark_crop(image: Image.Image, output: Path) -> None:
    width, height = image.size
    crop = image.crop((int(width * 0.66), int(height * 0.76), width, height)).convert("RGBA")
    background = Image.new("RGBA", crop.size, (255, 0, 255, 255))
    composited = Image.alpha_composite(background, crop)
    output.parent.mkdir(parents=True, exist_ok=True)
    composited.save(output)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute visual metrics from a generated RGBA keyframe.")
    parser.add_argument("--state", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--watermark-crop", required=True)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    rgba = np.array(image, dtype=np.uint8)
    alpha = rgba[:, :, 3]
    foreground = alpha > 10
    rgb = rgba[:, :, :3].astype(np.int16)
    blue_residual = (
        foreground
        & (rgb[:, :, 2] >= 105)
        & ((rgb[:, :, 2] - rgb[:, :, 0]) >= 32)
        & ((rgb[:, :, 2] - rgb[:, :, 1]) >= 6)
        & (rgb[:, :, 0] <= 165)
    )
    solid_foreground = alpha > 220
    edge_band = morphology(foreground, "dilate", 36) & ~morphology(solid_foreground, "erode", 24)
    edge_blue_residual = blue_residual & edge_band
    edge_pixels = int((foreground & edge_band).sum())

    foreground_pixels = int(foreground.sum())
    metrics = {
        "state": args.state,
        "alpha_bbox": bbox_from_mask(foreground),
        "main_component": main_component(foreground),
        "foreground_pixels": foreground_pixels,
        "blue_residual_pixels": int(blue_residual.sum()),
        "blue_residual_ratio": float(blue_residual.sum() / foreground_pixels) if foreground_pixels else 0.0,
        "edge_foreground_pixels": edge_pixels,
        "edge_blue_residual_pixels": int(edge_blue_residual.sum()),
        "edge_blue_residual_ratio": float(edge_blue_residual.sum() / edge_pixels) if edge_pixels else 0.0,
        "low_alpha_blue_residual_pixels": int((blue_residual & (alpha < 96)).sum()),
    }

    output_json = Path(args.output_json)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_watermark_crop(image, Path(args.watermark_crop))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
