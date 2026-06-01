#!/usr/bin/env python3
"""Create an RGBA matte video from blue-screen pet source footage."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

try:
    import cv2
except ImportError:  # pragma: no cover - the fallback path is intentionally simple.
    cv2 = None


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def flood_background(candidate: np.ndarray) -> np.ndarray:
    height, width = candidate.shape
    visited = np.zeros_like(candidate, dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        if candidate[0, x]:
            queue.append((0, x))
        if candidate[height - 1, x]:
            queue.append((height - 1, x))
    for y in range(height):
        if candidate[y, 0]:
            queue.append((y, 0))
        if candidate[y, width - 1]:
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        if visited[y, x] or not candidate[y, x]:
            continue
        visited[y, x] = True
        if y > 0:
            queue.append((y - 1, x))
        if y + 1 < height:
            queue.append((y + 1, x))
        if x > 0:
            queue.append((y, x - 1))
        if x + 1 < width:
            queue.append((y, x + 1))

    return visited


def sample_key_color(rgb: np.ndarray) -> np.ndarray:
    height, width, _ = rgb.shape
    border = max(6, min(width, height) // 36)
    border_pixels = np.concatenate(
        [
            rgb[:border, :, :].reshape(-1, 3),
            rgb[-border:, :, :].reshape(-1, 3),
            rgb[:, :border, :].reshape(-1, 3),
            rgb[:, -border:, :].reshape(-1, 3),
        ],
        axis=0,
    ).astype(np.int16)
    r = border_pixels[:, 0]
    g = border_pixels[:, 1]
    b = border_pixels[:, 2]
    blue = (b >= 120) & ((b - r) >= 48) & ((b - g) >= 12) & (r <= 130)
    candidates = border_pixels[blue]
    if len(candidates) == 0:
        return np.array([0, 92, 255], dtype=np.int16)
    return np.median(candidates, axis=0).astype(np.int16)


def blue_screen_candidate(rgb: np.ndarray, key_color: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.int16)
    r = values[:, :, 0]
    g = values[:, :, 1]
    b = values[:, :, 2]
    key_r, key_g, key_b = [int(value) for value in key_color]

    blue_dominant = (b >= 105) & (r <= 150) & ((b - r) >= 42) & ((b - g) >= 8)
    close_to_key = (
        (np.abs(r - key_r) <= 56)
        & (np.abs(g - key_g) <= 78)
        & (np.abs(b - key_b) <= 76)
        & ((b - r) >= 34)
        & ((b - g) >= 4)
    )
    saturated_screen = (b >= 150) & (r <= 115) & (g <= 195) & ((b - r) >= 54) & ((b - g) >= 22)
    return blue_dominant & (close_to_key | saturated_screen)


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
    image = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    size = radius * 2 + 1
    if operation == "dilate":
        image = image.filter(ImageFilter.MaxFilter(size))
    elif operation == "erode":
        image = image.filter(ImageFilter.MinFilter(size))
    return np.array(image) > 0


def doubao_watermark_rois(width: int, height: int, mask_preset: str) -> tuple[tuple[int, int, int, int], ...]:
    if mask_preset == "doubao_ai_corner":
        return ((int(width * 0.58), int(height * 0.84), width, height),)
    if mask_preset == "doubao_ai_dynamic":
        return (
            (int(width * 0.58), int(height * 0.84), width, height),
            (0, 0, int(width * 0.46), int(height * 0.18)),
        )
    if mask_preset == "doubao_ai_main_states":
        return (
            (0, int(height * 0.78), int(width * 0.56), height),
            (int(width * 0.44), int(height * 0.78), width, height),
            (0, 0, int(width * 0.48), int(height * 0.22)),
            (int(width * 0.52), 0, width, int(height * 0.22)),
        )
    if mask_preset == "guofeng_mouse_cursor":
        return (
            (int(width * 0.58), int(height * 0.84), width, height),
        )
    return ()


def filter_component_area(mask: np.ndarray, min_area: int, max_area: int | None = None) -> np.ndarray:
    if cv2 is None or not mask.any():
        return mask

    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count <= 1:
        return mask

    filtered = np.zeros_like(mask, dtype=bool)
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        if max_area is not None and area > max_area:
            continue
        filtered |= labels == label
    return filtered


def green_prop_foreground(rgb: np.ndarray, key_color: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.int16)
    r = values[:, :, 0]
    g = values[:, :, 1]
    b = values[:, :, 2]
    rgb_max = np.maximum(np.maximum(r, g), b)
    rgb_min = np.minimum(np.minimum(r, g), b)
    blue = blue_screen_candidate(rgb, key_color)
    green_fabric = (g >= 78) & ((g - r) >= -28) & ((g - b) >= -34) & ((b - r) <= 82)
    pale_prop = (rgb_min >= 86) & ((rgb_max - rgb_min) <= 118) & (g >= b - 22)
    prop = (green_fabric | pale_prop) & ~blue
    return filter_component_area(prop, 3600)


def watermark_text_mask(roi: np.ndarray, key_color: np.ndarray) -> np.ndarray:
    values = roi.astype(np.int16)
    roi_max = values.max(axis=2)
    roi_min = values.min(axis=2)
    roi_range = roi_max - roi_min
    blue = blue_screen_candidate(roi, key_color)
    pale_text = (roi_max >= 132) & (roi_min >= 92) & (roi_range <= 96) & ~blue
    bright_text = (roi_min >= 118) & (roi_range <= 118) & ~blue
    blue = blue_screen_candidate(roi, key_color)
    blue_support = morphology(blue, "dilate", 8)
    mask = (pale_text | bright_text) & blue_support
    if cv2 is not None:
        hsv = cv2.cvtColor(roi, cv2.COLOR_RGB2HSV)
        saturation = hsv[:, :, 1]
        value = hsv[:, :, 2]
        mask |= (value >= 120) & (saturation <= 85) & ~blue & blue_support
    return filter_component_area(mask, 3, 2600)


def remove_doubao_watermark(rgb: np.ndarray, key_color: np.ndarray, mask_preset: str) -> np.ndarray:
    if mask_preset not in {"doubao_ai_corner", "doubao_ai_dynamic", "doubao_ai_main_states", "guofeng_mouse_cursor"}:
        return rgb

    cleaned = rgb.copy()
    height, width, _ = cleaned.shape
    for x1, y1, x2, y2 in doubao_watermark_rois(width, height, mask_preset):
        roi = cleaned[y1:y2, x1:x2, :]
        if roi.size == 0:
            continue
        mask_bool = watermark_text_mask(roi, key_color)
        subject = skin_and_warm_foreground(roi) | green_prop_foreground(roi, key_color)
        mask_bool = mask_bool & ~morphology(subject, "dilate", 2)
        if int(mask_bool.sum()) < 8:
            continue

        mask_bool = morphology(mask_bool, "dilate", 3)
        if cv2 is not None:
            mask = (mask_bool.astype(np.uint8) * 255)
            cleaned[y1:y2, x1:x2, :] = cv2.inpaint(roi, mask, 5, cv2.INPAINT_TELEA)
            continue

        roi[mask_bool] = key_color.astype(np.uint8)
        cleaned[y1:y2, x1:x2, :] = roi
    return cleaned


def blue_spill_mask(rgb: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.int16)
    r = values[:, :, 0]
    g = values[:, :, 1]
    b = values[:, :, 2]
    return (b >= 105) & ((b - r) >= 32) & ((b - g) >= 6) & (r <= 160)


def skin_and_warm_foreground(rgb: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.int16)
    r = values[:, :, 0]
    g = values[:, :, 1]
    b = values[:, :, 2]
    rgb_max = np.maximum(np.maximum(r, g), b)
    rgb_min = np.minimum(np.minimum(r, g), b)
    skin = (
        (r >= 125)
        & (g >= 72)
        & (b >= 45)
        & ((r - g) >= 8)
        & ((g - b) >= -2)
        & ((r - b) >= 28)
        & ((r - b) <= 150)
        & ((rgb_max - rgb_min) <= 150)
    )
    pale_warm = (
        (r >= 165)
        & (g >= 132)
        & (b >= 108)
        & ((r - b) >= 12)
        & ((r - g) <= 75)
        & ((g - b) <= 72)
    )
    soft_skin_shadow = (
        (r >= 82)
        & (g >= 55)
        & (b >= 45)
        & ((b - r) <= 85)
        & ((r - g) >= -12)
        & ((r - b) <= 155)
        & ((rgb_max - rgb_min) <= 175)
    )
    return skin | pale_warm | soft_skin_shadow


def blue_pollution_mask(rgb: np.ndarray, alpha: np.ndarray, edge_band: np.ndarray, key_color: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.int16)
    r = values[:, :, 0]
    g = values[:, :, 1]
    b = values[:, :, 2]
    blue_rgb = (b >= 92) & (((b - r) >= 26) | ((b - g) >= 12)) & ((b - r) >= 12)
    key_distance = np.linalg.norm(values - key_color.reshape(1, 1, 3).astype(np.int16), axis=2)
    near_key = key_distance <= 150
    alpha_edge = alpha > 0
    mask = edge_band & alpha_edge & blue_rgb & (near_key | (alpha < 180))

    if cv2 is not None:
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        hue = hsv[:, :, 0]
        saturation = hsv[:, :, 1]
        value = hsv[:, :, 2]
        hsv_blue = (hue >= 82) & (hue <= 132) & (saturation >= 42) & (value >= 60)
        mask |= edge_band & alpha_edge & hsv_blue & (near_key | (blue_rgb & (alpha < 220)) | (alpha < 180))
    return mask


def propagated_clean_color(rgb: np.ndarray, clean_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if cv2 is not None:
        weight = clean_mask.astype(np.float32)
        blurred_weight = cv2.GaussianBlur(weight, (0, 0), 9)
        colors = []
        for channel in range(3):
            color = cv2.GaussianBlur(rgb[:, :, channel].astype(np.float32) * weight, (0, 0), 9)
            colors.append(color / np.maximum(blurred_weight, 1e-4))
        return np.stack(colors, axis=2), blurred_weight > 0.03

    weight_image = Image.fromarray((clean_mask * 255).astype(np.uint8), mode="L").filter(ImageFilter.GaussianBlur(9))
    blurred_weight = np.array(weight_image, dtype=np.float32) / 255.0
    colors = []
    for channel in range(3):
        channel_image = Image.fromarray((rgb[:, :, channel] * clean_mask).astype(np.uint8), mode="L")
        channel_blur = channel_image.filter(ImageFilter.GaussianBlur(9))
        colors.append(np.array(channel_blur, dtype=np.float32) / np.maximum(blurred_weight, 1e-4))
    return np.stack(colors, axis=2), blurred_weight > 0.03


def restore_lower_warm_support(rgb: np.ndarray, alpha: np.ndarray, warm_subject: np.ndarray) -> None:
    height, _width = alpha.shape
    lower_half = np.arange(height)[:, None] > int(height * 0.48)
    support = morphology(warm_subject, "dilate", 1) & lower_half
    support = support & (alpha < 220)
    if not support.any():
        return

    color_field, valid_color = propagated_clean_color(rgb, warm_subject)
    support = support & valid_color
    if not support.any():
        return

    rgb[support] = np.clip(color_field[support], 0, 255).astype(np.uint8)
    alpha[support] = np.maximum(alpha[support], 190)


def blue_fringe_cleanup_rgba(rgba: np.ndarray, key_color: np.ndarray) -> np.ndarray:
    output = rgba.copy()
    rgb = output[:, :, :3]
    alpha = output[:, :, 3]

    foreground = alpha > 10
    solid_foreground = alpha > 220
    edge_band = morphology(foreground, "dilate", 36) & ~morphology(solid_foreground, "erode", 24)
    protected_warm = skin_and_warm_foreground(rgb) & edge_band
    pollution = blue_pollution_mask(rgb, alpha, edge_band, key_color)
    if not pollution.any():
        return output

    alpha[protected_warm & foreground] = np.maximum(alpha[protected_warm & foreground], 96)

    pollution = pollution & (alpha > 0)
    clean_mask = foreground & ~pollution & ~blue_spill_mask(rgb) & ((alpha > 128) | protected_warm)
    color_field, valid_color = propagated_clean_color(rgb, clean_mask)
    recolor = pollution & valid_color
    if recolor.any():
        strength = np.where(protected_warm, 0.38, np.where(alpha < 128, 0.76, 0.56)).astype(np.float32)
        strength = strength[:, :, None]
        rgb_float = rgb.astype(np.float32)
        mixed = rgb_float * (1.0 - strength) + color_field * strength
        rgb[recolor] = np.clip(mixed[recolor], 0, 255).astype(np.uint8)

    rgb16 = rgb.astype(np.int16)
    r = rgb16[:, :, 0]
    g = rgb16[:, :, 1]
    b = rgb16[:, :, 2]
    blue_limit = np.maximum(r, g) + 8
    cap_mask = pollution & ((b - np.maximum(r, g)) > 8)
    b[cap_mask] = blue_limit[cap_mask]
    rgb16[:, :, 2] = b
    rgb[:, :, :] = np.clip(rgb16, 0, 255).astype(np.uint8)

    if cv2 is not None:
        blurred_alpha = cv2.GaussianBlur(alpha, (0, 0), 0.45)
    else:
        blurred_alpha = np.array(Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(0.45)))
    feather_band = edge_band & (alpha > 0) & (alpha < 250) & ~protected_warm
    alpha[feather_band] = blurred_alpha[feather_band]
    alpha[solid_foreground & ~edge_band] = np.maximum(alpha[solid_foreground & ~edge_band], 220)
    output[:, :, 3] = alpha
    return output


def clear_state_fixed_blue_holes(rgba: np.ndarray, key_color: np.ndarray, state: str) -> np.ndarray:
    if state != "coding":
        return rgba

    cleaned = rgba.copy()
    height, width, _ = cleaned.shape
    x1 = int(width * 0.065)
    x2 = int(width * 0.255)
    y1 = int(height * 0.28)
    y2 = int(height * 0.78)
    roi = cleaned[y1:y2, x1:x2, :]
    if roi.size == 0:
        return cleaned

    rgb = roi[:, :, :3]
    alpha = roi[:, :, 3]
    blue_hole = blue_screen_candidate(rgb, key_color) & (alpha > 0)
    protected = skin_and_warm_foreground(rgb) | green_prop_foreground(rgb, key_color)
    blue_hole = blue_hole & ~morphology(protected, "dilate", 1)
    blue_hole = filter_component_area(blue_hole, 20, 12000)
    if not blue_hole.any():
        return cleaned

    alpha[blue_hole] = 0
    roi[:, :, 3] = alpha
    cleaned[y1:y2, x1:x2, :] = roi
    return cleaned


def stabilize_alpha_frames(frames: list[np.ndarray]) -> list[np.ndarray]:
    if len(frames) < 3:
        return frames

    stabilized: list[np.ndarray] = [frames[0]]
    for index in range(1, len(frames) - 1):
        previous_alpha = frames[index - 1][:, :, 3]
        current = frames[index].copy()
        current_alpha = current[:, :, 3]
        next_alpha = frames[index + 1][:, :, 3]
        neighbor_floor = np.minimum(previous_alpha, next_alpha)
        warm = skin_and_warm_foreground(current[:, :, :3])
        candidate = warm & (neighbor_floor > 64) & (current_alpha < neighbor_floor)
        if candidate.any():
            current_alpha[candidate] = np.maximum(current_alpha[candidate], neighbor_floor[candidate])
            current[:, :, 3] = current_alpha
        stabilized.append(current)
    stabilized.append(frames[-1])
    return stabilized


def remove_small_alpha_islands(rgba: np.ndarray, min_area: int = 240) -> np.ndarray:
    alpha = rgba[:, :, 3]
    foreground = alpha > 10
    if not foreground.any():
        return rgba

    if cv2 is None:
        return rgba

    component_count, labels, stats, _centroids = cv2.connectedComponentsWithStats(
        foreground.astype(np.uint8), 8
    )
    if component_count <= 2:
        return rgba

    areas = stats[:, cv2.CC_STAT_AREA]
    main_label = int(np.argmax(areas[1:]) + 1)
    keep = labels == main_label
    for label in range(1, component_count):
        if label == main_label:
            continue
        if int(areas[label]) >= min_area:
            keep |= labels == label

    if keep.all():
        return rgba

    cleaned = rgba.copy()
    cleaned[:, :, 3] = np.where(keep, alpha, 0).astype(np.uint8)
    return cleaned


def matte_frame(
    input_path: Path,
    output_path: Path,
    mask_preset: str,
    state: str,
    background_dilate: int,
    alpha_blur: float,
    spill_alpha_cap: int,
) -> np.ndarray:
    image = Image.open(input_path).convert("RGBA")
    rgba = np.array(image, dtype=np.uint8)
    original_rgb = rgba[:, :, :3]
    key_color = sample_key_color(original_rgb)
    cleaned_rgb = remove_doubao_watermark(original_rgb, key_color, mask_preset)
    protected_subject = skin_and_warm_foreground(cleaned_rgb)
    blue_candidate = blue_screen_candidate(cleaned_rgb, key_color) & ~protected_subject
    background = flood_background(blue_candidate)

    background_image = Image.fromarray((background * 255).astype(np.uint8), mode="L")
    if background_dilate > 0:
        background_image = background_image.filter(ImageFilter.MaxFilter(background_dilate * 2 + 1))
    background_expanded = np.array(background_image) > 0

    alpha = (~background_expanded * 255).astype(np.uint8)
    alpha_image = Image.fromarray(alpha, mode="L")
    if alpha_blur > 0:
        alpha_image = alpha_image.filter(ImageFilter.GaussianBlur(alpha_blur))
    alpha = np.array(alpha_image, dtype=np.uint8)
    alpha[protected_subject] = np.maximum(alpha[protected_subject], 220)

    near_background_image = Image.fromarray((background * 255).astype(np.uint8), mode="L")
    near_background_image = near_background_image.filter(ImageFilter.MaxFilter(9))
    near_background = np.array(near_background_image) > 0
    spill = blue_spill_mask(cleaned_rgb) & near_background & (alpha > 0)
    if spill_alpha_cap < 255:
        alpha[spill] = np.minimum(alpha[spill], spill_alpha_cap)

    output_rgba = rgba.copy()
    output_rgba[:, :, :3] = cleaned_rgb
    output_rgba[:, :, 3] = alpha
    output_rgba = clear_state_fixed_blue_holes(output_rgba, key_color, state)
    output_rgba = blue_fringe_cleanup_rgba(output_rgba, key_color)

    return output_rgba


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert blue-screen footage into an RGBA FFV1 matte video.")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, default=1536)
    parser.add_argument("--height", type=int, default=1728)
    parser.add_argument("--mask-preset", default="none")
    parser.add_argument("--state", default="")
    parser.add_argument("--background-dilate", type=int, default=0)
    parser.add_argument("--alpha-blur", type=float, default=0.55)
    parser.add_argument("--spill-alpha-cap", type=int, default=255)
    args = parser.parse_args()

    source = Path(args.input)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="blue-screen-matte-") as temp_dir:
        temp = Path(temp_dir)
        source_frames = temp / "source" / "frame_%05d.png"
        alpha_dir = temp / "alpha"
        source_frames.parent.mkdir(parents=True, exist_ok=True)
        run(
            [
                args.ffmpeg,
                "-y",
                "-v",
                "error",
                "-i",
                str(source),
                "-vf",
                "format=rgba",
                str(source_frames),
            ]
        )

        processed_frames: list[tuple[str, np.ndarray]] = []
        for frame in sorted(source_frames.parent.glob("frame_*.png")):
            processed_frames.append(
                (
                    frame.name,
                    matte_frame(
                        frame,
                        alpha_dir / frame.name,
                        args.mask_preset,
                        args.state,
                        args.background_dilate,
                        args.alpha_blur,
                        args.spill_alpha_cap,
                    ),
                )
            )

        arrays = stabilize_alpha_frames([array for _name, array in processed_frames])
        for (name, _array), stabilized_array in zip(processed_frames, arrays):
            output_path = alpha_dir / name
            output_path.parent.mkdir(parents=True, exist_ok=True)
            island_min_area = 1000 if args.mask_preset == "guofeng_mouse_cursor" else 240
            cleaned_array = remove_small_alpha_islands(stabilized_array, min_area=island_min_area)
            Image.fromarray(cleaned_array, mode="RGBA").save(output_path)

        run(
            [
                args.ffmpeg,
                "-y",
                "-v",
                "error",
                "-framerate",
                "24",
                "-i",
                str(alpha_dir / "frame_%05d.png"),
                "-vf",
                (
                    f"scale={args.width}:{args.height}:force_original_aspect_ratio=decrease,"
                    f"pad={args.width}:{args.height}:(ow-iw)/2:(oh-ih)/2:0x00000000,"
                    "format=rgba"
                ),
                "-an",
                "-c:v",
                "ffv1",
                "-pix_fmt",
                "rgba",
                str(output),
            ]
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
