#!/usr/bin/env python3
"""Helpers for the P0 action registry asset layout."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pet_profiles


ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "data" / "config" / "action_registry.config.json"
ACTIVE_PROFILE_ID = pet_profiles.DEFAULT_PROFILE_ID


def set_profile(profile_id: str | None) -> None:
    global ACTIVE_PROFILE_ID
    pet_profiles.set_active_profile(profile_id)
    ACTIVE_PROFILE_ID = pet_profiles.active_profile_id()


def registry_path(profile_id: str | None = None) -> Path:
    if profile_id is None:
        profile_id = ACTIVE_PROFILE_ID
    try:
        return pet_profiles.action_registry_path(profile_id)
    except KeyError:
        return REGISTRY_PATH


def load_registry(profile_id: str | None = None) -> dict[str, Any]:
    return json.loads(registry_path(profile_id).read_text(encoding="utf-8"))


def load_actions(profile_id: str | None = None) -> dict[str, dict[str, Any]]:
    return dict(load_registry(profile_id)["actions"])


def action_ids(include_fallback: bool = False) -> tuple[str, ...]:
    registry = load_registry()
    ids = [str(action_id) for action_id in registry["actionOrder"]]
    if include_fallback:
        fallback = str(registry["fallbackAction"])
        if fallback not in ids:
            ids.append(fallback)
    return tuple(ids)


def action(action_id: str) -> dict[str, Any]:
    actions = load_actions()
    if action_id not in actions:
        raise KeyError(f"Unknown action id: {action_id}")
    return actions[action_id]


def action_path(action_id: str) -> Path:
    return ROOT / str(action(action_id)["path"])


def source_dir(action_id: str) -> Path:
    return ROOT / str(action(action_id)["sourceDir"])


def webm_path(action_id: str) -> Path:
    return ROOT / str(action(action_id)["webmPath"])


def fallback_path(action_id: str) -> Path:
    return ROOT / str(action(action_id)["fallbackPath"])


def keyframe_dir(action_id: str) -> Path:
    return fallback_path(action_id).parent


def source_video_paths(action_id: str) -> list[Path]:
    return [ROOT / str(path) for path in action(action_id).get("sourceVideoPaths", [])]
