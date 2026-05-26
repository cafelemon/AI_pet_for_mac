#!/usr/bin/env python3
"""Check that runtime action IDs are accepted by renderer state contracts."""

from __future__ import annotations

import json
import re
from pathlib import Path

import action_registry


ROOT = Path(__file__).resolve().parents[1]
STATES_CONFIG_PATH = ROOT / "data" / "config" / "states.config.json"
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
    states_config = json.loads(STATES_CONFIG_PATH.read_text(encoding="utf-8"))
    configured_states = set(states_config["states"])
    main_companion_states = extract_string_set(MAIN_TS_PATH, "COMPANION_STATES")
    renderer_states = extract_string_set(APP_TSX_PATH, "RENDER_STATES")
    actions = action_registry.load_actions()
    failures: list[str] = []

    for action_id in states_config["pa0KeyframeFolders"]:
        action = actions.get(action_id)
        if not action:
            failures.append(f"missing registry action: {action_id}")
            continue
        if not action.get("runtime") or not action.get("available"):
            failures.append(f"configured render action is not runtime available: {action_id}")

    for state in sorted(configured_states):
        if state not in main_companion_states:
            failures.append(f"state missing from Electron COMPANION_STATES: {state}")
        if state not in renderer_states:
            failures.append(f"state missing from renderer RENDER_STATES: {state}")

    for failure in failures:
        print(f"FAIL: {failure}")

    if failures:
        return 1

    print("Action registry runtime contract check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
