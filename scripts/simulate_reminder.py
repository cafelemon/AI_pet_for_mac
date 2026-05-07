#!/usr/bin/env python3
"""Create a local reminder row for PA4 smoke tests."""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "sqlite" / "reminders.db"
PRIORITIES = {"high": 0, "normal": 1, "low": 2}
REPEAT_RULES = {"none", "daily", "weekly", "monthly"}


def iso_z(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def now_iso() -> str:
    return iso_z(datetime.now(timezone.utc))


def due_at_iso(seconds: int) -> str:
    return iso_z(datetime.now(timezone.utc) + timedelta(seconds=seconds))


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          due_at TEXT NOT NULL,
          repeat_rule TEXT NOT NULL DEFAULT 'none',
          priority INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'scheduled',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          triggered_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_due
          ON reminders(status, due_at, priority);
        """
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a PA4 reminder for smoke tests.")
    parser.add_argument("--title", default="PA4 smoke reminder")
    parser.add_argument("--due-seconds", type=int, default=5)
    parser.add_argument("--priority", choices=tuple(PRIORITIES), default="normal")
    parser.add_argument("--repeat-rule", choices=tuple(REPEAT_RULES), default="none")
    parser.add_argument("--database-path", default=str(DEFAULT_DATABASE_PATH))
    args = parser.parse_args()

    database_path = Path(args.database_path).expanduser()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = now_iso()
    due_at = due_at_iso(max(0, args.due_seconds))

    with sqlite3.connect(database_path) as connection:
        ensure_schema(connection)
        cursor = connection.execute(
            """
            INSERT INTO reminders (title, due_at, repeat_rule, priority, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'scheduled', ?, ?)
            """,
            (args.title.strip() or "PA4 smoke reminder", due_at, args.repeat_rule, PRIORITIES[args.priority], timestamp, timestamp),
        )
        connection.commit()

    print(f"created reminder #{cursor.lastrowid}: {args.title} @ {due_at}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
