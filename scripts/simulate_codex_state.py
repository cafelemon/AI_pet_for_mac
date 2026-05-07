#!/usr/bin/env python3
"""Write a simulated Codex runtime state for PA3 smoke tests."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_STATE_PATH = Path.home() / ".desktop-ai-companion" / "runtime_state" / "codex_state.json"
VALID_STATES = ("idle", "coding", "thinking", "waiting_auth", "success", "error")
DEFAULT_MESSAGES = {
    "idle": None,
    "coding": "正在运行...",
    "thinking": "我在想...",
    "waiting_auth": "需要你确认一下",
    "success": "完成啦",
    "error": "出问题了",
}


def timestamp_iso(age_ms: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(milliseconds=age_ms)).isoformat()


def expires_at_iso(ttl_ms: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(milliseconds=ttl_ms)).isoformat()


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_name = handle.name
    os.replace(temp_name, path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate Desktop AI Companion Codex runtime state.")
    parser.add_argument("--state", required=True, choices=VALID_STATES)
    parser.add_argument("--message")
    parser.add_argument("--task")
    parser.add_argument("--event", default="Simulate")
    parser.add_argument("--cwd", default=os.getcwd())
    parser.add_argument("--tool-name")
    parser.add_argument("--exit-code", type=int)
    parser.add_argument("--ttl-ms", type=int, help="Optional expiry duration in milliseconds.")
    parser.add_argument("--age-ms", type=int, default=0, help="Write a timestamp this many milliseconds in the past.")
    parser.add_argument(
        "--state-path",
        default=os.environ.get("DESKTOP_AI_COMPANION_CODEX_STATE_PATH", str(DEFAULT_STATE_PATH)),
        help="Path to codex_state.json.",
    )
    args = parser.parse_args()

    payload: dict[str, Any] = {
        "source": "codex",
        "state": args.state,
        "timestamp": timestamp_iso(args.age_ms),
        "event": args.event,
        "cwd": args.cwd,
    }

    message = args.message if args.message is not None else DEFAULT_MESSAGES[args.state]
    if message:
        payload["message"] = message
    if args.task:
        payload["task"] = args.task
    if args.tool_name:
        payload["toolName"] = args.tool_name
    if args.exit_code is not None:
        payload["exitCode"] = args.exit_code
    if args.ttl_ms is not None:
        payload["expiresAt"] = expires_at_iso(args.ttl_ms)

    atomic_write_json(Path(args.state_path).expanduser(), payload)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
