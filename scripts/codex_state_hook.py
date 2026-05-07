#!/usr/bin/env python3
"""Codex hook entrypoint that writes Desktop AI Companion runtime state."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_STATE_PATH = Path.home() / ".desktop-ai-companion" / "runtime_state" / "codex_state.json"
VALID_STATES = {"idle", "coding", "thinking", "waiting_auth", "success", "error"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def expires_at_iso(hold_ms: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(milliseconds=hold_ms)).isoformat()


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_name = handle.name
    os.replace(temp_name, path)


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def first_int(*values: Any) -> int | None:
    for value in values:
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            try:
                return int(value)
            except ValueError:
                continue
    return None


def normalized_event(event: str | None) -> str:
    if not event:
        return ""
    return event.replace("_", "").replace("-", "").lower()


def infer_event(payload: dict[str, Any], forced_event: str | None) -> str:
    return (
        forced_event
        or first_string(
            payload.get("event"),
            payload.get("hook_event_name"),
            payload.get("hookEventName"),
            payload.get("hookName"),
        )
        or ""
    )


def extract_tool_input(payload: dict[str, Any]) -> dict[str, Any]:
    return as_dict(payload.get("toolInput") or payload.get("tool_input") or payload.get("toolArgs"))


def extract_tool_result(payload: dict[str, Any]) -> dict[str, Any]:
    return as_dict(payload.get("toolResult") or payload.get("tool_result") or payload.get("result"))


def extract_task(payload: dict[str, Any]) -> str | None:
    tool_input = extract_tool_input(payload)
    return first_string(
        payload.get("task"),
        payload.get("prompt"),
        payload.get("message"),
        tool_input.get("command"),
        tool_input.get("cmd"),
        tool_input.get("file_path"),
        tool_input.get("path"),
        payload.get("cwd"),
    )


def extract_tool_name(payload: dict[str, Any]) -> str | None:
    return first_string(payload.get("toolName"), payload.get("tool_name"), payload.get("tool"), payload.get("toolKind"))


def extract_exit_code(payload: dict[str, Any]) -> int | None:
    tool_result = extract_tool_result(payload)
    return first_int(
        payload.get("exitCode"),
        payload.get("exit_code"),
        tool_result.get("exitCode"),
        tool_result.get("exit_code"),
        tool_result.get("code"),
    )


def post_tool_succeeded(payload: dict[str, Any], exit_code: int | None) -> bool:
    success = payload.get("success")
    if isinstance(success, bool):
        return success
    executed = payload.get("executed")
    if isinstance(executed, bool) and not executed:
        return False
    if exit_code is not None:
        return exit_code == 0
    return True


def build_state(args: argparse.Namespace, payload: dict[str, Any]) -> dict[str, Any]:
    event = infer_event(payload, args.event)
    event_key = normalized_event(event)
    exit_code = extract_exit_code(payload)
    tool_name = extract_tool_name(payload)
    task = extract_task(payload)
    cwd = first_string(payload.get("cwd"))

    state = "idle"
    message = None
    expires_at = None

    if event_key == "pretooluse":
        state = "coding"
        message = "正在运行..."
    elif event_key == "posttooluse":
        if post_tool_succeeded(payload, exit_code):
            state = "thinking"
            message = "我在看结果..."
        else:
            state = "error"
            message = "出问题了"
            expires_at = expires_at_iso(args.error_hold_ms)
    elif event_key == "permissionrequest":
        state = "waiting_auth"
        message = "需要你确认一下"
    elif event_key == "stop":
        state = "success"
        message = "完成啦"
        expires_at = expires_at_iso(args.success_hold_ms)
    elif tool_name:
        state = "coding"
        message = "正在运行..."

    if state not in VALID_STATES:
        raise ValueError(f"invalid runtime state: {state}")

    output: dict[str, Any] = {
        "source": "codex",
        "state": state,
        "timestamp": now_iso(),
    }
    if message:
        output["message"] = message
    if task:
        output["task"] = task
    if event:
        output["event"] = event
    if cwd:
        output["cwd"] = cwd
    if tool_name:
        output["toolName"] = tool_name
    if exit_code is not None:
        output["exitCode"] = exit_code
    if expires_at:
        output["expiresAt"] = expires_at

    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Write Desktop AI Companion Codex runtime state from hook JSON.")
    parser.add_argument("--event", help="Hook event name when the Codex payload does not include it.")
    parser.add_argument(
        "--state-path",
        default=os.environ.get("DESKTOP_AI_COMPANION_CODEX_STATE_PATH", str(DEFAULT_STATE_PATH)),
        help="Path to codex_state.json.",
    )
    parser.add_argument("--success-hold-ms", type=int, default=4000)
    parser.add_argument("--error-hold-ms", type=int, default=8000)
    args = parser.parse_args()

    raw = os.sys.stdin.read().strip()
    payload = json.loads(raw) if raw else {}
    if not isinstance(payload, dict):
        payload = {}

    state = build_state(args, payload)
    atomic_write_json(Path(args.state_path).expanduser(), state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
