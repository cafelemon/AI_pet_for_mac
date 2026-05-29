#!/usr/bin/env python3
"""Check that runtime action IDs are accepted by renderer state contracts."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import action_registry
import pet_profiles


ROOT = Path(__file__).resolve().parents[1]
MAIN_TS_PATH = ROOT / "app" / "electron" / "main.ts"
APP_TSX_PATH = ROOT / "app" / "renderer" / "src" / "App.tsx"


def extract_string_set(path: Path, const_name: str) -> set[str]:
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(rf"const {re.escape(const_name)}[^=]*=\s*(?:new Set\()?(\[[^\]]+\])", re.S)
    match = pattern.search(text)
    if not match:
        raise ValueError(f"Unable to find {const_name} in {path.relative_to(ROOT)}")
    return set(re.findall(r"'([^']+)'", match.group(1)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Check renderer state contracts for one pet profile.")
    parser.add_argument("--profile", default=pet_profiles.DEFAULT_PROFILE_ID, help="Pet profile id.")
    args = parser.parse_args()

    action_registry.set_profile(args.profile)
    states_config = json.loads(pet_profiles.states_config_path(args.profile).read_text(encoding="utf-8"))
    configured_states = set(states_config["states"])
    main_companion_states = extract_string_set(MAIN_TS_PATH, "COMPANION_STATES")
    renderer_states = extract_string_set(APP_TSX_PATH, "RENDER_STATES")
    actions = action_registry.load_actions()
    allow_unavailable = args.profile != pet_profiles.DEFAULT_PROFILE_ID
    failures: list[str] = []
    warnings: list[str] = []

    for action_id in states_config["pa0KeyframeFolders"]:
        action = actions.get(action_id)
        if not action:
            failures.append(f"missing registry action: {action_id}")
            continue
        if not action.get("runtime") or not action.get("available"):
            message = f"configured render action is not runtime available: {action_id}"
            if allow_unavailable:
                warnings.append(message)
            else:
                failures.append(message)

    for state in sorted(configured_states):
        if state not in main_companion_states:
            failures.append(f"state missing from Electron COMPANION_STATES: {state}")
        if state not in renderer_states:
            failures.append(f"state missing from renderer RENDER_STATES: {state}")

    for warning in warnings:
        print(f"WARN: {warning}")
    for failure in failures:
        print(f"FAIL: {failure}")

    if failures:
        return 1

    print("Action registry runtime contract check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
