#!/usr/bin/env python3
"""Safely install Desktop AI Companion Codex hook entries."""

from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HOOK_SCRIPT = PROJECT_ROOT / "scripts" / "codex_state_hook.py"
DEFAULT_CODEX_HOME = Path.home() / ".codex"
DEFAULT_STATE_PATH = Path.home() / ".desktop-ai-companion" / "runtime_state" / "codex_state.json"
HOOK_EVENTS = ("PreToolUse", "PostToolUse", "PermissionRequest", "Stop")
EVENT_MATCHERS = {
    "PreToolUse": "Bash",
    "PostToolUse": "Bash",
    "PermissionRequest": "*",
    "Stop": "*",
}
COMMAND_MARKER = "codex_state_hook.py"


def load_hooks(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_name = handle.name
    os.replace(temp_name, path)


def command_for_event(event: str, state_path: Path) -> str:
    parts = [
        sys.executable,
        str(HOOK_SCRIPT),
        "--event",
        event,
        "--state-path",
        str(state_path),
    ]
    return " ".join(shlex.quote(part) for part in parts)


def is_companion_hook(hook: Any) -> bool:
    return isinstance(hook, dict) and COMMAND_MARKER in str(hook.get("command", ""))


def remove_companion_hooks(data: dict[str, Any]) -> dict[str, Any]:
    next_data = dict(data)
    hooks = next_data.get("hooks")
    if not isinstance(hooks, dict):
        next_data["hooks"] = {}
        return next_data

    next_hooks: dict[str, Any] = {}
    for event, groups in hooks.items():
        if not isinstance(groups, list):
            next_hooks[event] = groups
            continue

        next_groups = []
        for group in groups:
            if not isinstance(group, dict):
                next_groups.append(group)
                continue
            group_hooks = group.get("hooks")
            if not isinstance(group_hooks, list):
                next_groups.append(group)
                continue
            filtered_hooks = [hook for hook in group_hooks if not is_companion_hook(hook)]
            if filtered_hooks:
                next_group = dict(group)
                next_group["hooks"] = filtered_hooks
                next_groups.append(next_group)
        if next_groups:
            next_hooks[event] = next_groups

    next_data["hooks"] = next_hooks
    return next_data


def install_companion_hooks(data: dict[str, Any], state_path: Path) -> dict[str, Any]:
    next_data = remove_companion_hooks(data)
    hooks = next_data.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        hooks = {}
        next_data["hooks"] = hooks

    for event in HOOK_EVENTS:
        groups = hooks.setdefault(event, [])
        if not isinstance(groups, list):
            groups = []
            hooks[event] = groups
        groups.append(
            {
                "matcher": EVENT_MATCHERS[event],
                "hooks": [
                    {
                        "type": "command",
                        "command": command_for_event(event, state_path),
                        "timeout": 5,
                    }
                ],
            }
        )

    return next_data


def backup_hooks(path: Path) -> Path | None:
    if not path.exists():
        return None
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup_path = path.with_name(f"{path.name}.backup-desktop-ai-companion-{stamp}")
    shutil.copy2(path, backup_path)
    return backup_path


def print_preview(path: Path, payload: dict[str, Any]) -> None:
    print(f"hooks path: {path}")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Desktop AI Companion Codex hooks.")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--dry-run", action="store_true", help="Print the merged hooks.json without writing it.")
    action.add_argument("--install", action="store_true", help="Install Desktop AI Companion hook entries.")
    action.add_argument("--uninstall", action="store_true", help="Remove Desktop AI Companion hook entries.")
    parser.add_argument("--codex-home", default=str(DEFAULT_CODEX_HOME), help="Codex config directory.")
    parser.add_argument("--state-path", default=str(DEFAULT_STATE_PATH), help="Desktop AI Companion state file path.")
    args = parser.parse_args()

    codex_home = Path(args.codex_home).expanduser()
    hooks_path = codex_home / "hooks.json"
    state_path = Path(args.state_path).expanduser()
    current = load_hooks(hooks_path)

    if args.uninstall:
        next_hooks = remove_companion_hooks(current)
    else:
        next_hooks = install_companion_hooks(current, state_path)

    if args.dry_run:
        print_preview(hooks_path, next_hooks)
        return 0

    backup_path = backup_hooks(hooks_path)
    atomic_write_json(hooks_path, next_hooks)

    if backup_path:
        print(f"backup: {backup_path}")
    print(f"updated: {hooks_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
