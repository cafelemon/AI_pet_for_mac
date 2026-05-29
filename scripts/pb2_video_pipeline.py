#!/usr/bin/env python3
"""Validate PB2 source videos and convert them to transparent WebM."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import action_registry
import pet_profiles


ROOT = Path(__file__).resolve().parents[1]
CANVAS_SIZE = (1536, 1728)
ACTIVE_PROFILE_ID = pet_profiles.DEFAULT_PROFILE_ID
CATALOG_PATH = pet_profiles.motion_catalog_path(ACTIVE_PROFILE_ID)
SOURCES_PATH = pet_profiles.motion_sources_path(ACTIVE_PROFILE_ID)
MASK_PRESETS = (
    "auto",
    "none",
    "jimeng_corner",
    "kling_corner",
    "doubao_ai_corner",
    "doubao_ai_dynamic",
    "doubao_ai_main_states",
)
MATTE_PRESETS = ("auto", "white", "neutral_floor", "sleep_props", "blue_screen")
CROP_PRESETS = ("auto", "none", "duck_sit_to_sleep", "sleep_to_stand")
FLOOD_FILL_MARKER = (255, 0, 0)
BBOX_PATTERN = re.compile(
    r"x1:(?P<x1>\d+) x2:(?P<x2>\d+) y1:(?P<y1>\d+) y2:(?P<y2>\d+) "
    r"w:(?P<width>\d+) h:(?P<height>\d+)"
)


def configure_profile(profile_id: str) -> None:
    global ACTIVE_PROFILE_ID, CATALOG_PATH, SOURCES_PATH
    pet_profiles.set_active_profile(profile_id)
    ACTIVE_PROFILE_ID = pet_profiles.active_profile_id()
    action_registry.set_profile(ACTIVE_PROFILE_ID)
    CATALOG_PATH = pet_profiles.motion_catalog_path(ACTIVE_PROFILE_ID)
    SOURCES_PATH = pet_profiles.motion_sources_path(ACTIVE_PROFILE_ID)


@dataclass(frozen=True)
class AlphaBox:
    x1: int
    y1: int
    x2: int
    y2: int


@dataclass(frozen=True)
class LayoutPreset:
    target_cx: int = 768
    target_bottom: int | None = None
    target_height: int | None = None
    min_scale: float = 0.88
    max_scale: float = 1.18


@dataclass(frozen=True)
class LayoutReferencePreset:
    sample_indices: tuple[int, ...] | None = None
    measurement_box: AlphaBox | None = None
    source_measurement_box: AlphaBox | None = None
    sample_mode: str = "explicit"


@dataclass(frozen=True)
class BoundingBox:
    x1: int
    y1: int
    x2: int
    y2: int

    @property
    def width(self) -> int:
        return self.x2 - self.x1 + 1

    @property
    def height(self) -> int:
        return self.y2 - self.y1 + 1

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def bottom(self) -> int:
        return self.y2


# Duck-sit family is locked to the actual seated body that `stand_to_duck_sit`
# lands on at its current accepted runtime tail. These values come from the
# accepted bridge's extracted last frame body bbox, not from any one duck-sit
# motion's own union box.
DUCK_SIT_ANCHOR_PRESET = LayoutPreset(
    target_cx=776,
    target_bottom=1627,
    target_height=656,
    min_scale=0.82,
    max_scale=0.90,
)
DUCK_SIT_STATIC_MEASUREMENT_BOX = AlphaBox(390, 680, 1145, 1568)
DUCK_SIT_STATIC_SOURCE_MEASUREMENT_BOX = AlphaBox(80, 100, 830, 935)
DUCK_SIT_FAMILY_STATES = (
    "duck_sit_idle",
    "duck_sit_head_hair",
    "duck_sit_finger_lip",
    "duck_sit_stretch",
)


LAYOUT_PRESETS: dict[str, LayoutPreset] = {
    "guofeng_standing": LayoutPreset(target_cx=768, target_bottom=1704, target_height=750, min_scale=0.34, max_scale=1.20),
    "guofeng_seated": LayoutPreset(target_cx=768, target_bottom=1696, target_height=820, min_scale=0.70, max_scale=1.55),
    "guofeng_work": LayoutPreset(target_cx=768, target_bottom=1718, target_height=1180, min_scale=0.70, max_scale=2.20),
    "guofeng_work_small": LayoutPreset(target_cx=768, target_bottom=1704, target_height=760, min_scale=0.30, max_scale=1.00),
    "guofeng_recline_small": LayoutPreset(target_cx=768, target_bottom=1668, target_height=520, min_scale=0.30, max_scale=1.00),
    "guofeng_prop_sleep_small": LayoutPreset(target_cx=768, target_bottom=1648, target_height=680, min_scale=0.30, max_scale=1.00),
    "guofeng_prop_wide": LayoutPreset(target_cx=768, target_bottom=1690, target_height=1220, min_scale=0.50, max_scale=2.00),
    "guofeng_drag": LayoutPreset(target_cx=768, target_bottom=1640, target_height=1500, min_scale=0.70, max_scale=2.40),
    # Standing-family states are aligned to the current accepted `idle_yawn`
    # runtime body size, not to the full motion union box.
    "idle": LayoutPreset(target_cx=769, target_bottom=1724, target_height=809, min_scale=0.45, max_scale=0.55),
    "idle_hair": LayoutPreset(target_cx=769, target_bottom=1724, target_height=809, min_scale=0.45, max_scale=0.56),
    "idle_yawn": LayoutPreset(target_cx=769, target_bottom=1724, target_height=809, min_scale=0.70, max_scale=0.82),
    "reading": LayoutPreset(target_cx=768, target_bottom=1724, target_height=1560, min_scale=1.03, max_scale=1.08),
    "coding": LayoutPreset(target_cx=780, target_bottom=1724, target_height=1536, min_scale=1.03, max_scale=1.08),
    "reminder": LayoutPreset(target_cx=769, target_bottom=1724, target_height=809, min_scale=0.72, max_scale=0.82),
    "thinking": LayoutPreset(target_bottom=1648, min_scale=0.95, max_scale=1.08),
    "error": LayoutPreset(target_bottom=1658, min_scale=0.95, max_scale=1.08),
    "success": LayoutPreset(target_cx=769, target_bottom=1724, target_height=809, min_scale=0.72, max_scale=0.82),
    "duck_sit_idle": DUCK_SIT_ANCHOR_PRESET,
    "duck_sit_head_hair": LayoutPreset(
        target_cx=DUCK_SIT_ANCHOR_PRESET.target_cx,
        target_bottom=DUCK_SIT_ANCHOR_PRESET.target_bottom,
        target_height=668,
        min_scale=0.84,
        max_scale=0.92,
    ),
    "duck_sit_finger_lip": DUCK_SIT_ANCHOR_PRESET,
    "duck_sit_stretch": LayoutPreset(
        target_cx=DUCK_SIT_ANCHOR_PRESET.target_cx,
        target_bottom=DUCK_SIT_ANCHOR_PRESET.target_bottom,
        target_height=664,
        min_scale=0.83,
        max_scale=0.94,
    ),
    "stand_to_duck_sit": LayoutPreset(target_cx=769, target_bottom=1724, target_height=809, min_scale=0.74, max_scale=0.84),
    "duck_sit_to_stand": LayoutPreset(target_cx=769, target_bottom=1724, target_height=809, min_scale=0.74, max_scale=0.84),
    "duck_sit_to_sleep": LayoutPreset(target_bottom=1664, min_scale=0.96, max_scale=1.03),
    "sleep": LayoutPreset(target_bottom=1664, min_scale=0.96, max_scale=1.03),
    "sleep_to_stand": LayoutPreset(target_bottom=1664, min_scale=0.96, max_scale=1.03),
}
LAYOUT_REFERENCE_PRESETS: dict[str, LayoutReferencePreset] = {
    # Measure only the main body lane so gestures, reminder UI, and jump
    # effects do not inflate the alignment size.
    "idle": LayoutReferencePreset(
        measurement_box=AlphaBox(540, 60, 1000, 1728),
        source_measurement_box=AlphaBox(180, 40, 520, 1279),
    ),
    "idle_hair": LayoutReferencePreset(
        measurement_box=AlphaBox(540, 60, 1000, 1728),
        source_measurement_box=AlphaBox(170, 40, 520, 1279),
    ),
    "idle_yawn": LayoutReferencePreset(
        measurement_box=AlphaBox(540, 60, 1000, 1728),
        source_measurement_box=AlphaBox(220, 240, 500, 1080),
    ),
    "reminder": LayoutReferencePreset(
        measurement_box=AlphaBox(540, 60, 1000, 1728),
        source_measurement_box=AlphaBox(150, 220, 470, 1279),
    ),
    # Use the pre-jump standing samples as the body-size anchor, then keep the
    # full jump readable in the final zoomed-out crop.
    "success": LayoutReferencePreset(
        sample_indices=(0, 1, 2),
        measurement_box=AlphaBox(540, 60, 1000, 1728),
        source_measurement_box=AlphaBox(320, 40, 590, 1015),
    ),
    "stand_to_duck_sit": LayoutReferencePreset(
        sample_indices=(0, 1, 2),
        measurement_box=AlphaBox(540, 60, 1000, 1728),
        source_measurement_box=AlphaBox(320, 40, 590, 1015),
    ),
    "duck_sit_to_stand": LayoutReferencePreset(
        sample_indices=(2, 3, 4),
        measurement_box=AlphaBox(540, 60, 1000, 1728),
        source_measurement_box=AlphaBox(210, 20, 610, 1019),
    ),
    "duck_sit_idle": LayoutReferencePreset(
        sample_indices=(0, 1, 2, 3),
        measurement_box=DUCK_SIT_STATIC_MEASUREMENT_BOX,
        source_measurement_box=DUCK_SIT_STATIC_SOURCE_MEASUREMENT_BOX,
        sample_mode="duck_sit_body_static",
    ),
    "duck_sit_head_hair": LayoutReferencePreset(
        sample_indices=(0, 1, 7, 8, 9),
        measurement_box=DUCK_SIT_STATIC_MEASUREMENT_BOX,
        source_measurement_box=DUCK_SIT_STATIC_SOURCE_MEASUREMENT_BOX,
        sample_mode="duck_sit_body_static",
    ),
    "duck_sit_finger_lip": LayoutReferencePreset(
        sample_indices=(0, 3),
        measurement_box=DUCK_SIT_STATIC_MEASUREMENT_BOX,
        source_measurement_box=DUCK_SIT_STATIC_SOURCE_MEASUREMENT_BOX,
        sample_mode="duck_sit_body_static",
    ),
    "duck_sit_stretch": LayoutReferencePreset(
        sample_indices=(0, 1, 4, 5),
        measurement_box=DUCK_SIT_STATIC_MEASUREMENT_BOX,
        source_measurement_box=DUCK_SIT_STATIC_SOURCE_MEASUREMENT_BOX,
        sample_mode="duck_sit_body_static",
    ),
    # Sleep-family alignment stays local to the sleep chain. We do not touch
    # locked standing or duck-sit anchors; instead we measure the bridge tail
    # and wake head/tail windows that are supposed to connect.
    "duck_sit_to_sleep": LayoutReferencePreset(
        sample_indices=(0, 1, 2, 10, 11, 12, 13),
        measurement_box=AlphaBox(250, 120, 1460, 1670),
        source_measurement_box=AlphaBox(110, 80, 835, 1060),
        sample_mode="bridge_entry_and_tail",
    ),
    "sleep": LayoutReferencePreset(
        sample_indices=(0, 1, 2, 3, 4),
        measurement_box=AlphaBox(250, 500, 1460, 1715),
        source_measurement_box=AlphaBox(80, 180, 845, 1000),
        sample_mode="sleep_anchor_tail",
    ),
    "sleep_to_stand": LayoutReferencePreset(
        sample_indices=(0, 1, 2, 13, 14, 15),
        measurement_box=AlphaBox(350, 560, 1180, 1670),
        source_measurement_box=AlphaBox(150, 100, 820, 1030),
        sample_mode="sleep_head_and_standing_tail",
    ),
}

WHITE_CLEANUP_BOXES: dict[str, tuple[AlphaBox, ...]] = {
    "coding": (
        AlphaBox(360, 300, 1210, 1728),
        AlphaBox(675, 1210, 1190, 1645),
        AlphaBox(990, 1435, 1430, 1705),
        AlphaBox(390, 1520, 575, 1705),
        AlphaBox(720, 1580, 1010, 1705),
    ),
    "reading": (
        AlphaBox(330, 235, 1205, 1728),
        AlphaBox(880, 860, 1210, 1728),
        AlphaBox(330, 1400, 520, 1728),
    ),
    "idle": (AlphaBox(570, 90, 980, 1728),),
    "idle_hair": (AlphaBox(570, 90, 980, 1728),),
    "idle_yawn": (AlphaBox(560, 160, 950, 1728),),
    "thinking": (AlphaBox(220, 1200, 1320, 1590),),
    "error": (AlphaBox(270, 1260, 1265, 1505),),
    "duck_sit_idle": (AlphaBox(150, 1260, 1385, 1595),),
    "duck_sit_head_hair": (AlphaBox(150, 1260, 1385, 1595),),
    "duck_sit_finger_lip": (AlphaBox(150, 1260, 1385, 1595),),
    "duck_sit_stretch": (AlphaBox(150, 1260, 1385, 1595),),
    "duck_sit_to_stand": (AlphaBox(140, 1260, 1390, 1595),),
    "stand_to_duck_sit": (AlphaBox(140, 1260, 1390, 1595),),
    "duck_sit_to_sleep": (
        AlphaBox(0, 1320, 790, 1728),
        AlphaBox(1060, 1260, 1536, 1728),
        AlphaBox(0, 0, 340, 1728),
        AlphaBox(1210, 0, 1536, 1728),
    ),
    "sleep_to_stand": (
        AlphaBox(0, 1320, 490, 1728),
        AlphaBox(1180, 1260, 1536, 1728),
    ),
}
CLEANUP_RGB_MIN: dict[str, int] = {
    "coding": 190,
    "reading": 205,
    "thinking": 165,
    "error": 165,
    "duck_sit_idle": 230,
    "duck_sit_head_hair": 230,
    "duck_sit_finger_lip": 230,
    "duck_sit_stretch": 230,
    "stand_to_duck_sit": 230,
    "duck_sit_to_stand": 230,
}
FINAL_WHITE_CLEANUP_BOXES: dict[str, tuple[AlphaBox, ...]] = {
    "coding": (
        AlphaBox(372, 312, 1188, 1728),
        AlphaBox(800, 1500, 1115, 1728),
        AlphaBox(1180, 1470, 1360, 1728),
        AlphaBox(1390, 1500, 1505, 1728),
    ),
    "reading": (
        AlphaBox(350, 250, 1185, 1728),
        AlphaBox(895, 875, 1188, 1728),
        AlphaBox(345, 1435, 505, 1728),
    ),
    "idle": (AlphaBox(590, 104, 960, 1728),),
    "idle_hair": (AlphaBox(590, 104, 960, 1728),),
    "idle_yawn": (
        AlphaBox(560, 160, 679, 1728),
        AlphaBox(856, 160, 950, 1728),
        AlphaBox(680, 160, 855, 880),
        AlphaBox(680, 1040, 855, 1728),
    ),
    "reminder": (
        AlphaBox(595, 1005, 735, 1188),
        AlphaBox(742, 1170, 805, 1692),
    ),
    "sleep": (
        AlphaBox(835, 620, 1215, 860),
        AlphaBox(289, 770, 370, 1560),
        AlphaBox(289, 1450, 545, 1565),
    ),
    "duck_sit_to_sleep": (
        AlphaBox(0, 0, 180, 1728),
        AlphaBox(0, 0, 360, 1240),
        AlphaBox(1180, 0, 1536, 1728),
        AlphaBox(1080, 0, 1536, 1180),
        AlphaBox(1120, 1180, 1536, 1728),
    ),
    "success": (
        AlphaBox(746, 1220, 808, 1688),
    ),
    "thinking": (
        AlphaBox(220, 1185, 1325, 1600),
        AlphaBox(1115, 490, 1455, 1125),
    ),
}
ALPHA_RESTORE_BOXES: dict[str, tuple[AlphaBox, ...]] = {
    "coding": (
        AlphaBox(490, 250, 760, 520),
        AlphaBox(560, 560, 860, 930),
        AlphaBox(760, 650, 990, 930),
    ),
    "reading": (
        AlphaBox(470, 230, 760, 520),
        AlphaBox(500, 560, 770, 920),
        AlphaBox(700, 620, 900, 900),
    ),
    "thinking": (
        AlphaBox(250, 1000, 580, 1575),
        AlphaBox(1085, 400, 1470, 1145),
    ),
    "sleep": (
        AlphaBox(360, 820, 1160, 1535),
        AlphaBox(520, 1440, 1055, 1608),
        AlphaBox(1000, 1445, 1270, 1695),
    ),
    "duck_sit_to_sleep": (
        AlphaBox(990, 300, 1536, 1500),
        AlphaBox(1040, 1180, 1536, 1715),
        AlphaBox(760, 520, 1536, 1220),
        AlphaBox(900, 1180, 1536, 1660),
    ),
    "sleep": (
        AlphaBox(205, 430, 1405, 1600),
        AlphaBox(70, 720, 360, 1660),
        AlphaBox(450, 1380, 1090, 1710),
        AlphaBox(1020, 1375, 1405, 1715),
    ),
    "sleep_to_stand": (
        AlphaBox(220, 470, 1410, 1610),
        AlphaBox(90, 760, 360, 1670),
        AlphaBox(450, 1380, 1090, 1710),
        AlphaBox(1020, 1375, 1405, 1715),
    ),
}

SLEEP_FAMILY_SAMPLE_INDICES: dict[str, dict[str, tuple[int, ...]]] = {
    "duck_sit_to_sleep": {
        "entry": (0, 1, 2),
        "tail": (10, 11, 12, 13),
    },
    "sleep": {
        "tail": (0, 1, 2, 3, 4),
    },
    "sleep_to_stand": {
        "head": (0, 1, 2),
        "standing_tail": (13, 14, 15),
    },
}


def filtered_static_duck_sit_boxes(boxes: list[BoundingBox], indices: tuple[int, ...]) -> list[BoundingBox]:
    selected = [boxes[index] for index in indices if 0 <= index < len(boxes)]
    if not selected:
        return []

    heights = sorted(box.height for box in selected)
    bottoms = sorted(box.bottom for box in selected)
    min_height = heights[max(0, len(heights) // 3)]
    max_bottom = bottoms[-1]
    return [
        box
        for box in selected
        if box.height >= min_height and abs(box.bottom - max_bottom) <= 18
    ]


def load_source_config() -> dict[str, object]:
    if not SOURCES_PATH.exists():
        return {
            "defaults": {
                "provider": "unknown",
                "sourceFile": None,
                "maskPreset": "none",
                "mattePreset": "white",
                "cropPreset": "none",
                "layoutPreset": None,
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
            "reading",
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
    return action_registry.source_dir(state)


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
    crop_preset = defaults.get("cropPreset") or "none"
    layout_preset = defaults.get("layoutPreset")
    return {
        "provider": str(provider),
        "sourceFile": str(source_file) if source_file else None,
        "maskPreset": str(mask_preset),
        "mattePreset": str(matte_preset),
        "cropPreset": str(crop_preset),
        "layoutPreset": str(layout_preset) if layout_preset else None,
    }


def source_candidates(state: str) -> list[Path]:
    info = source_info(state)
    directory = source_dir(state)
    candidates: list[Path] = action_registry.source_video_paths(state)
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
    return action_registry.webm_path(state)


def qa_contact_sheet(state: str) -> Path:
    return pet_profiles.qa_root(ACTIVE_PROFILE_ID) / f"{state}_contact.png"


def resolve_tool(name: str, explicit_path: str | None) -> str:
    if explicit_path:
        return explicit_path
    path = shutil.which(name)
    if not path:
        raise FileNotFoundError(f"{name} was not found. Install ffmpeg or pass --{name}-path.")
    return path


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


def capture(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def union_bounding_boxes(boxes: list[BoundingBox]) -> BoundingBox | None:
    if not boxes:
        return None
    return BoundingBox(
        x1=min(box.x1 for box in boxes),
        y1=min(box.y1 for box in boxes),
        x2=max(box.x2 for box in boxes),
        y2=max(box.y2 for box in boxes),
    )


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
    if state == "all":
        return states
    if state not in states:
        raise ValueError(f"Unknown action for profile {ACTIVE_PROFILE_ID}: {state}")
    return (state,)


def existing_runtime_states(states: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(state for state in states if source_video(state).exists())


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
                f"matte={source_meta['mattePreset']} crop={source_meta['cropPreset']} "
                f"layout={source_meta['layoutPreset'] or 'auto'}"
            )
        else:
            print(
                f"OK: {path.relative_to(ROOT)} provider={info['provider']} "
                f"mask={info['maskPreset']} matte={info['mattePreset']} "
                f"crop={info['cropPreset']} layout={info['layoutPreset'] or 'auto'}"
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


def resolve_crop_preset(state: str, requested_preset: str) -> str:
    if requested_preset != "auto":
        return requested_preset
    preset = source_info(state)["cropPreset"] or "none"
    if preset not in CROP_PRESETS:
        raise ValueError(f"unknown crop preset for {state}: {preset}")
    if preset == "auto":
        return "none"
    return preset


def crop_filters(crop_preset: str) -> list[str]:
    if crop_preset == "none":
        return []
    if crop_preset == "duck_sit_to_sleep":
        return ["crop=944:1072:488:4"]
    if crop_preset == "sleep_to_stand":
        return ["crop=960:1072:480:4"]
    raise ValueError(f"unknown crop preset: {crop_preset}")


def pad_color_for_matte(matte_preset: str) -> str:
    if matte_preset == "blue_screen":
        return "0x005bff"
    return "white"


def color_prep_filters(mask_preset: str, crop_preset: str, matte_preset: str) -> list[str]:
    filters = [
        *crop_filters(crop_preset),
        f"scale={CANVAS_SIZE[0]}:{CANVAS_SIZE[1]}:force_original_aspect_ratio=decrease",
        f"pad={CANVAS_SIZE[0]}:{CANVAS_SIZE[1]}:(ow-iw)/2:(oh-ih)/2:{pad_color_for_matte(matte_preset)}",
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
    elif mask_preset == "doubao_ai_corner":
        filters.append(f"drawbox=x=iw*0.66:y=ih*0.76:w=iw*0.34:h=ih*0.24:color={pad_color_for_matte(matte_preset)}:t=fill")
    elif mask_preset == "doubao_ai_dynamic":
        pass
    elif mask_preset != "none":
        raise ValueError(f"unknown mask preset: {mask_preset}")
    filters.append("format=rgb24")
    return filters


def marker_to_alpha_filters() -> list[str]:
    marker_r, marker_g, marker_b = FLOOD_FILL_MARKER
    # Fill connected background candidates from all canvas corners with a chroma
    # marker, then key only that marker. This protects disconnected white props
    # such as the cup, shoes, computer, and table from the background matte pass.
    flood_fill = (
        "floodfill=x={x}:y={y}:"
        "s0=0:s1=0:s2=0:"
        f"d0={marker_r}:d1={marker_g}:d2={marker_b}"
    )
    # FFmpeg's RGB floodfill writes this marker as green in the RGB frame that
    # follows, so the colorkey pass treats green as connected background.
    return [
        flood_fill.format(x=0, y=0),
        flood_fill.format(x=CANVAS_SIZE[0] - 1, y=0),
        flood_fill.format(x=0, y=CANVAS_SIZE[1] - 1),
        flood_fill.format(x=CANVAS_SIZE[0] - 1, y=CANVAS_SIZE[1] - 1),
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


def sleep_props_matte_filter() -> str:
    return white_connected_matte_filter(0.055)


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


def blue_screen_matte_filter() -> str:
    # Treat only connected blue-screen pixels as background so disconnected
    # blue-green costume ornaments, tassels, and shadows survive the key pass.
    background_candidate = (
        "if(gte(b(X,Y),145)*lte(r(X,Y),105)*lte(g(X,Y),185)*"
        "gte(b(X,Y)-r(X,Y),58)*gte(b(X,Y)-g(X,Y),32),0,255)"
    )
    return ",".join(
        [
            f"geq=r='{background_candidate}':g='{background_candidate}':b='{background_candidate}'",
            *marker_to_alpha_filters(),
        ]
    )


def connected_background_matte_filter(background_similarity: float, matte_preset: str) -> str:
    if matte_preset == "white":
        return white_connected_matte_filter(background_similarity)
    if matte_preset == "sleep_props":
        return sleep_props_matte_filter()
    if matte_preset == "neutral_floor":
        return neutral_floor_matte_filter()
    if matte_preset == "blue_screen":
        return blue_screen_matte_filter()
    raise ValueError(f"unknown matte preset: {matte_preset}")


def alpha_refine_filter(matte_preset: str) -> str:
    if matte_preset == "blue_screen":
        return "dilation,dilation,dilation,dilation,dilation,dilation,boxblur=1:1"
    return "null"


def blue_screen_matte_python() -> Path:
    candidate = ROOT / "skills" / "white-bg-video-matting" / ".venv" / "bin" / "python"
    if candidate.exists():
        return candidate
    return Path(shutil.which("python3") or "python3")


def cleanup_condition(state: str, boxes: tuple[AlphaBox, ...]) -> str:
    box_condition = alpha_box_condition(boxes)
    if box_condition == "0":
        return "0"
    rgb_min = "min(min(r(X,Y),g(X,Y)),b(X,Y))"
    rgb_max = "max(max(r(X,Y),g(X,Y)),b(X,Y))"
    white_candidate = f"gte({rgb_min},{CLEANUP_RGB_MIN.get(state, 190)})*lte({rgb_max}-{rgb_min},76)"
    return f"gt(({box_condition})*({white_candidate}),0)"


def alpha_box_condition(boxes: tuple[AlphaBox, ...]) -> str:
    if not boxes:
        return "0"
    box_conditions = [
        f"(gte(X,{box.x1})*lte(X,{box.x2})*gte(Y,{box.y1})*lte(Y,{box.y2}))"
        for box in boxes
    ]
    return "+".join(box_conditions)


def alpha_restore_condition(state: str) -> str:
    box_condition = alpha_box_condition(ALPHA_RESTORE_BOXES.get(state, ()))
    if box_condition == "0":
        return "0"

    rgb_min = "min(min(r(X,Y),g(X,Y)),b(X,Y))"
    rgb_max = "max(max(r(X,Y),g(X,Y)),b(X,Y))"
    rgb_range = f"{rgb_max}-{rgb_min}"
    if state == "coding":
        skin_candidate = (
            "gte(r(X,Y),132)*gte(g(X,Y),96)*gte(b(X,Y),76)*"
            "gte(r(X,Y)-g(X,Y),10)*gte(g(X,Y)-b(X,Y),4)*"
            "lte(r(X,Y)-b(X,Y),108)*lte(g(X,Y)-b(X,Y),72)*"
            f"lte({rgb_range},112)"
        )
        prop_candidate = skin_candidate
    elif state == "reading":
        skin_candidate = (
            "gte(r(X,Y),128)*gte(g(X,Y),92)*gte(b(X,Y),74)*"
            "gte(r(X,Y)-g(X,Y),10)*gte(g(X,Y)-b(X,Y),4)*"
            "lte(r(X,Y)-b(X,Y),108)*lte(g(X,Y)-b(X,Y),72)*"
            f"lte({rgb_range},112)"
        )
        prop_candidate = skin_candidate
    elif state == "thinking":
        skin_candidate = (
            "gte(r(X,Y),132)*gte(g(X,Y),96)*gte(b(X,Y),76)*"
            "gte(r(X,Y)-g(X,Y),10)*gte(g(X,Y)-b(X,Y),4)*"
            "lte(r(X,Y)-b(X,Y),108)*lte(g(X,Y)-b(X,Y),72)*"
            f"lte({rgb_range},116)"
        )
        prop_candidate = skin_candidate
    elif state in {"sleep", "duck_sit_to_sleep"}:
        warm_cream = (
            "gte(r(X,Y),90)*gte(g(X,Y),72)*gte(b(X,Y),48)*"
            f"lte({rgb_max},250)*gte(r(X,Y)-b(X,Y),12)*"
            "lte(r(X,Y)-g(X,Y),68)*lte(g(X,Y)-b(X,Y),74)"
        )
        prop_candidate = warm_cream
    else:
        return "0"
    return f"gt(({box_condition})*({prop_candidate}),0)"


def alpha_adjust_filter(state: str, cleanup_boxes: tuple[AlphaBox, ...]) -> str:
    cleanup = cleanup_condition(state, cleanup_boxes)
    restore = alpha_restore_condition(state)
    return (
        "format=rgba,"
        "geq="
        "r='r(X,Y)':"
        "g='g(X,Y)':"
        "b='b(X,Y)':"
        f"a='if({restore},255,if({cleanup},0,alpha(X,Y)))'"
    )


def transparent_cleanup_filter(state: str) -> str:
    return alpha_adjust_filter(state, WHITE_CLEANUP_BOXES.get(state, ()))


def final_transparent_cleanup_filter(state: str) -> str:
    return alpha_adjust_filter(state, FINAL_WHITE_CLEANUP_BOXES.get(state, ()))


def write_matte_video(
    ffmpeg: str,
    state: str,
    output: Path,
    background_similarity: float,
    mask_preset: str,
    matte_preset: str,
    crop_preset: str,
) -> Path:
    source = source_video(state)
    if not source.exists():
        raise FileNotFoundError(f"missing source video: {source.relative_to(ROOT)}")

    output.parent.mkdir(parents=True, exist_ok=True)
    if matte_preset == "blue_screen":
        run(
            [
                str(blue_screen_matte_python()),
                str(ROOT / "scripts" / "blue_screen_matte.py"),
                "--ffmpeg",
                ffmpeg,
                "--input",
                str(source),
                "--output",
                str(output),
                "--width",
                str(CANVAS_SIZE[0]),
                "--height",
                str(CANVAS_SIZE[1]),
                "--mask-preset",
                mask_preset,
                "--state",
                state,
            ]
        )
        return output

    color_filter = ",".join(color_prep_filters(mask_preset, crop_preset, matte_preset))
    matte_filter = connected_background_matte_filter(background_similarity, matte_preset)
    video_filter = (
        f"[0:v]{color_filter},split[color][masksrc];"
        f"[masksrc]{matte_filter},{alpha_refine_filter(matte_preset)}[alpha];"
        f"[color][alpha]alphamerge,{transparent_cleanup_filter(state)},format=rgba"
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
            "ffv1",
            "-pix_fmt",
            "rgba",
            str(output),
        ]
    )
    return output


def measure_alpha_boxes(ffmpeg: str, video: Path) -> list[BoundingBox]:
    result = subprocess.run(
        [
            ffmpeg,
            "-v",
            "info",
            "-i",
            str(video),
            "-vf",
            "fps=1,alphaextract,bbox=min_val=16",
            "-f",
            "null",
            "-",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    boxes: list[BoundingBox] = []
    for match in BBOX_PATTERN.finditer(result.stderr):
        boxes.append(
            BoundingBox(
                x1=int(match.group("x1")),
                y1=int(match.group("y1")),
                x2=int(match.group("x2")),
                y2=int(match.group("y2")),
            )
        )

    return boxes


def intersect_bounding_box(box: BoundingBox, clip: AlphaBox) -> BoundingBox | None:
    x1 = max(box.x1, clip.x1)
    y1 = max(box.y1, clip.y1)
    x2 = min(box.x2, clip.x2)
    y2 = min(box.y2, clip.y2)
    if x1 > x2 or y1 > y2:
        return None
    return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)


def reference_measurement_box(state: str, boxes: list[BoundingBox]) -> AlphaBox | None:
    preset = LAYOUT_REFERENCE_PRESETS.get(state)
    if not preset:
        return None
    if preset.source_measurement_box is None:
        return preset.measurement_box
    max_x = max(box.x2 for box in boxes)
    max_y = max(box.y2 for box in boxes)
    if max_x <= 1024 and max_y <= 1280:
        return preset.source_measurement_box
    return preset.measurement_box


def selected_reference_boxes_for_state(state: str, boxes: list[BoundingBox]) -> list[BoundingBox]:
    if not boxes:
        return []

    preset = LAYOUT_REFERENCE_PRESETS.get(state)
    selected = boxes
    if preset and preset.sample_indices:
        sample_indices = preset.sample_indices
        if state == "duck_sit_to_sleep" and preset.sample_mode == "bridge_entry_and_tail":
            entry = [boxes[index] for index in SLEEP_FAMILY_SAMPLE_INDICES[state]["entry"] if 0 <= index < len(boxes)]
            tail = [boxes[index] for index in SLEEP_FAMILY_SAMPLE_INDICES[state]["tail"] if 0 <= index < len(boxes)]
            indexed = entry + tail if entry or tail else []
        elif state in DUCK_SIT_FAMILY_STATES and preset.sample_mode == "duck_sit_body_static":
            indexed = filtered_static_duck_sit_boxes(boxes, sample_indices)
        elif state == "sleep" and preset.sample_mode == "sleep_anchor_tail":
            indexed = [boxes[index] for index in SLEEP_FAMILY_SAMPLE_INDICES[state]["tail"] if 0 <= index < len(boxes)]
        elif state == "sleep_to_stand" and preset.sample_mode == "sleep_head_and_standing_tail":
            head = [boxes[index] for index in SLEEP_FAMILY_SAMPLE_INDICES[state]["head"] if 0 <= index < len(boxes)]
            tail = [boxes[index] for index in SLEEP_FAMILY_SAMPLE_INDICES[state]["standing_tail"] if 0 <= index < len(boxes)]
            indexed = head + tail if head or tail else []
        else:
            indexed = [boxes[index] for index in sample_indices if 0 <= index < len(boxes)]
        if indexed:
            selected = indexed

    measurement_box = reference_measurement_box(state, boxes)
    if measurement_box:
        clipped = [intersect_bounding_box(box, measurement_box) for box in selected]
        clipped = [box for box in clipped if box is not None]
        if clipped:
            selected = clipped

    return selected


def measure_alignment_bbox(ffmpeg: str, state: str, video: Path) -> BoundingBox | None:
    boxes = measure_alpha_boxes(ffmpeg, video)
    if not boxes:
        return None
    reference_boxes = selected_reference_boxes_for_state(state, boxes)
    return union_bounding_boxes(reference_boxes) or union_bounding_boxes(boxes)


def layout_preset_for_state(state: str) -> LayoutPreset:
    layout_preset = source_info(state).get("layoutPreset")
    if layout_preset:
        if layout_preset not in LAYOUT_PRESETS:
            raise ValueError(f"unknown layout preset for {state}: {layout_preset}")
        return LAYOUT_PRESETS[layout_preset]
    return LAYOUT_PRESETS.get(state, LayoutPreset(target_bottom=1724, min_scale=0.98, max_scale=1.04))


def required_margin(crop_start: int, crop_length: int, canvas_length: int) -> int:
    return max(640, 64 - crop_start, crop_start + crop_length - canvas_length + 64)


def layout_transform_filter(state: str, bbox: BoundingBox | None, matte_preset: str) -> str:
    if bbox is None:
        return "format=yuva420p"

    preset = layout_preset_for_state(state)
    scale = 1.0
    if preset.target_height:
        scale = preset.target_height / max(1, bbox.height)
    scale = clamp(scale, preset.min_scale, preset.max_scale)

    crop_width = max(2, round(CANVAS_SIZE[0] / scale / 2) * 2)
    crop_height = max(2, round(CANVAS_SIZE[1] / scale / 2) * 2)
    target_bottom = preset.target_bottom if preset.target_bottom is not None else bbox.bottom
    crop_x = round(bbox.cx - preset.target_cx / scale)
    crop_y = round(bbox.bottom - target_bottom / scale)
    margin_x = required_margin(crop_x, crop_width, CANVAS_SIZE[0])
    margin_y = required_margin(crop_y, crop_height, CANVAS_SIZE[1])

    filters = [
        "format=rgba",
        f"pad={CANVAS_SIZE[0] + margin_x * 2}:{CANVAS_SIZE[1] + margin_y * 2}:{margin_x}:{margin_y}:color=0x00000000",
        f"crop={crop_width}:{crop_height}:{crop_x + margin_x}:{crop_y + margin_y}",
        f"scale={CANVAS_SIZE[0]}:{CANVAS_SIZE[1]}:flags=lanczos",
    ]
    if matte_preset != "blue_screen":
        filters.append(final_transparent_cleanup_filter(state))
    filters.append("format=yuva420p")
    return ",".join(filters)


def convert_state(
    ffmpeg: str,
    state: str,
    crf: int,
    background_similarity: float,
    mask_preset: str,
    matte_preset: str,
    crop_preset: str,
) -> Path:
    output = output_webm(state)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"desktop-companion-{state}-") as temporary_directory:
        matte_video = Path(temporary_directory) / f"{state}_matte.mkv"
        write_matte_video(
            ffmpeg,
            state,
            matte_video,
            background_similarity,
            mask_preset,
            matte_preset,
            crop_preset,
        )
        bbox = measure_alignment_bbox(ffmpeg, state, matte_video)
        run(
            [
                ffmpeg,
                "-y",
                "-v",
                "error",
                "-i",
                str(matte_video),
                "-vf",
                layout_transform_filter(state, bbox, matte_preset),
                "-an",
                "-c:v",
                "libvpx-vp9",
                "-pix_fmt",
                "yuva420p",
                "-deadline",
                "good",
                "-cpu-used",
                "4",
                "-row-mt",
                "1",
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
    output = pet_profiles.qa_root(ACTIVE_PROFILE_ID) / "alpha" / f"{state}_alpha.png"
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


def write_checkerboard_contact_sheet(ffmpeg: str, state: str, webm: Path) -> None:
    output = pet_profiles.qa_root(ACTIVE_PROFILE_ID) / "checker" / f"{state}_checker.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    checker = (
        "nullsrc=s=1536x1728:r=1:d=60,"
        "geq=r='if(mod(floor(X/96)+floor(Y/96),2),210,255)':"
        "g='if(mod(floor(X/96)+floor(Y/96),2),210,255)':"
        "b='if(mod(floor(X/96)+floor(Y/96),2),210,255)'"
    )
    video_filter = (
        f"{checker}[bg];"
        "[0:v]fps=1,format=rgba[fg];"
        "[bg][fg]overlay=shortest=1:format=auto,"
        "scale=256:288:force_original_aspect_ratio=decrease,"
        "pad=256:288:(ow-iw)/2:(oh-ih)/2:white,"
        "tile=6x1:color=white"
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


def write_contact_sheet(ffmpeg: str, state: str, webm: Path) -> None:
    write_overlay_contact_sheet(ffmpeg, state, webm, "white", qa_contact_sheet(state))
    write_overlay_contact_sheet(
        ffmpeg,
        state,
        webm,
        "magenta",
        pet_profiles.qa_root(ACTIVE_PROFILE_ID) / "magenta" / f"{state}_magenta.png",
    )
    write_overlay_contact_sheet(
        ffmpeg,
        state,
        webm,
        "black",
        pet_profiles.qa_root(ACTIVE_PROFILE_ID) / "black" / f"{state}_black.png",
    )
    write_overlay_contact_sheet(
        ffmpeg,
        state,
        webm,
        "0x00ffff",
        pet_profiles.qa_root(ACTIVE_PROFILE_ID) / "cyan" / f"{state}_cyan.png",
    )
    write_overlay_contact_sheet(
        ffmpeg,
        state,
        webm,
        "gray",
        pet_profiles.qa_root(ACTIVE_PROFILE_ID) / "gray" / f"{state}_gray.png",
    )
    write_alpha_contact_sheet(ffmpeg, state, webm)
    write_checkerboard_contact_sheet(ffmpeg, state, webm)


def write_fallback_keyframe(ffmpeg: str, state: str, webm: Path) -> Path:
    output = action_registry.fallback_path(state)
    output.parent.mkdir(parents=True, exist_ok=True)
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
            "format=rgba",
            "-frames:v",
            "1",
            "-update",
            "1",
            str(output),
        ]
    )
    return output


def write_visual_metrics(state: str, keyframe: Path) -> None:
    metrics_root = pet_profiles.qa_root(ACTIVE_PROFILE_ID) / "metrics"
    run(
        [
            str(blue_screen_matte_python()),
            str(ROOT / "scripts" / "asset_visual_metrics.py"),
            "--state",
            state,
            "--input",
            str(keyframe),
            "--output-json",
            str(metrics_root / f"{state}.json"),
            "--watermark-crop",
            str(metrics_root / f"{state}_watermark_roi.png"),
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="PB2 source video validation and WebM conversion.")
    parser.add_argument("command", choices=("check", "convert"))
    parser.add_argument("--profile", default=pet_profiles.DEFAULT_PROFILE_ID, help="Pet profile id.")
    parser.add_argument("--state", default="all")
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
        "--crop-preset",
        choices=CROP_PRESETS,
        default="auto",
        help="Pre-matte crop preset. auto reads data/config/motion_sources.config.json.",
    )
    parser.add_argument(
        "--mask-watermark",
        action="store_true",
        help="Deprecated alias for --mask-preset jimeng_corner.",
    )
    args = parser.parse_args()

    configure_profile(args.profile)
    try:
        states = selected_states(args.state)
    except ValueError as exc:
        parser.error(str(exc))

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
        crop_preset = resolve_crop_preset(state, args.crop_preset)
        webm = convert_state(ffmpeg, state, args.crf, args.background_similarity, mask_preset, matte_preset, crop_preset)
        write_contact_sheet(ffmpeg, state, webm)
        keyframe = write_fallback_keyframe(ffmpeg, state, webm)
        write_visual_metrics(state, keyframe)
        provider = source_info(state)["provider"]
        print(
            f"WROTE: {webm.relative_to(ROOT)} provider={provider} "
            f"mask={mask_preset} matte={matte_preset} crop={crop_preset} "
            f"fallback={keyframe.relative_to(ROOT)}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
