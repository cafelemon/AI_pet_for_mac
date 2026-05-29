#!/usr/bin/env python3
"""Profile-aware config path helpers for Desktop AI Companion assets."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PROFILE_CONFIG_PATH = ROOT / "data" / "config" / "pet_profiles.config.json"
DEFAULT_PROFILE_ID = "legacy_real"
ACTIVE_PROFILE_ID = DEFAULT_PROFILE_ID


def load_profile_config() -> dict[str, Any]:
    if not PROFILE_CONFIG_PATH.exists():
        return {
            "version": 1,
            "defaultProfileId": DEFAULT_PROFILE_ID,
            "profiles": {
                DEFAULT_PROFILE_ID: {
                    "id": DEFAULT_PROFILE_ID,
                    "label": "真人桌宠",
                    "companionConfigPath": "data/config/companion.config.json",
                    "statesConfigPath": "data/config/states.config.json",
                    "actionRegistryPath": "data/config/action_registry.config.json",
                    "motionCatalogPath": "data/config/motion_catalog.config.json",
                    "motionSourcesPath": "data/config/motion_sources.config.json",
                    "actionProgressPath": "docs/generated/profiles/legacy_real/action_progress.md",
                    "qaRoot": "docs/generated/profiles/legacy_real/qa",
                    "assetRoot": "assets/actions",
                    "requiredAction": "idle",
                }
            },
        }
    return json.loads(PROFILE_CONFIG_PATH.read_text(encoding="utf-8"))


def default_profile_id() -> str:
    config = load_profile_config()
    return str(config.get("defaultProfileId") or DEFAULT_PROFILE_ID)


def profile(profile_id: str | None = None) -> dict[str, Any]:
    config = load_profile_config()
    profiles = config.get("profiles", {})
    if not isinstance(profiles, dict):
        raise KeyError("pet profile config is missing profiles")

    resolved_id = profile_id or ACTIVE_PROFILE_ID or default_profile_id()
    if resolved_id not in profiles:
        fallback_id = str(config.get("defaultProfileId") or DEFAULT_PROFILE_ID)
        if fallback_id not in profiles:
            raise KeyError(f"Unknown pet profile: {resolved_id}")
        resolved_id = fallback_id
    return dict(profiles[resolved_id])


def set_active_profile(profile_id: str | None) -> None:
    global ACTIVE_PROFILE_ID
    ACTIVE_PROFILE_ID = profile(profile_id)["id"]


def active_profile_id() -> str:
    return str(profile()["id"])


def profile_path(key: str, profile_id: str | None = None) -> Path:
    value = profile(profile_id).get(key)
    if not isinstance(value, str) or not value:
        raise KeyError(f"Profile {profile(profile_id)['id']} is missing {key}")
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def companion_config_path(profile_id: str | None = None) -> Path:
    return profile_path("companionConfigPath", profile_id)


def states_config_path(profile_id: str | None = None) -> Path:
    return profile_path("statesConfigPath", profile_id)


def action_registry_path(profile_id: str | None = None) -> Path:
    return profile_path("actionRegistryPath", profile_id)


def motion_catalog_path(profile_id: str | None = None) -> Path:
    return profile_path("motionCatalogPath", profile_id)


def motion_sources_path(profile_id: str | None = None) -> Path:
    return profile_path("motionSourcesPath", profile_id)


def action_progress_path(profile_id: str | None = None) -> Path:
    return profile_path("actionProgressPath", profile_id)


def qa_root(profile_id: str | None = None) -> Path:
    return profile_path("qaRoot", profile_id)
