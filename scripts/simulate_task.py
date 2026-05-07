#!/usr/bin/env python3
"""Create or update PA6 task center rows for smoke tests."""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "sqlite" / "tasks.db"


def iso_z(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def now_iso() -> str:
    return iso_z(datetime.now(timezone.utc))


def local_task_date() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          task_date TEXT NOT NULL,
          cwd TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_activity_at TEXT,
          completed_at TEXT,
          stuck_notified_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_today
          ON tasks(task_date, source, status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_codex_active
          ON tasks(source, status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_completed
          ON tasks(completed_at);
        """
    )


def create_manual(connection: sqlite3.Connection, title: str) -> int:
    timestamp = now_iso()
    cursor = connection.execute(
        """
        INSERT INTO tasks (title, source, status, task_date, created_at, updated_at)
        VALUES (?, 'manual', 'todo', ?, ?, ?)
        """,
        (title, local_task_date(), timestamp, timestamp),
    )
    return int(cursor.lastrowid)


def complete_task(connection: sqlite3.Connection, task_id: int | None) -> int | None:
    timestamp = now_iso()
    if task_id is None:
        row = connection.execute(
            """
            SELECT id FROM tasks
            WHERE source = 'manual' AND status IN ('todo', 'active', 'blocked')
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ).fetchone()
        if row is None:
            return None
        task_id = int(row[0])

    connection.execute(
        """
        UPDATE tasks
        SET status = 'done', updated_at = ?, completed_at = ?, stuck_notified_at = NULL
        WHERE id = ?
        """,
        (timestamp, timestamp, task_id),
    )
    return task_id


def create_stuck_codex(connection: sqlite3.Connection, title: str, age_minutes: int, cwd: str | None) -> int:
    timestamp = now_iso()
    last_activity_at = iso_z(datetime.now(timezone.utc) - timedelta(minutes=age_minutes))
    cursor = connection.execute(
        """
        INSERT INTO tasks (title, source, status, task_date, cwd, created_at, updated_at, last_activity_at)
        VALUES (?, 'codex', 'active', ?, ?, ?, ?, ?)
        """,
        (title, local_task_date(), cwd, timestamp, timestamp, last_activity_at),
    )
    return int(cursor.lastrowid)


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate PA6 task center rows.")
    parser.add_argument("--database-path", default=str(DEFAULT_DATABASE_PATH))
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_parser = subparsers.add_parser("create", help="Create a manual task.")
    create_parser.add_argument("--title", default="PA6 smoke task")

    complete_parser = subparsers.add_parser("complete", help="Complete a manual task.")
    complete_parser.add_argument("--id", type=int)

    stuck_parser = subparsers.add_parser("stuck-codex", help="Create a stuck Codex task.")
    stuck_parser.add_argument("--title", default="PA6 stuck Codex smoke")
    stuck_parser.add_argument("--age-minutes", type=int, default=4)
    stuck_parser.add_argument("--cwd", default=str(PROJECT_ROOT))

    args = parser.parse_args()
    database_path = Path(args.database_path).expanduser()
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(database_path) as connection:
        ensure_schema(connection)
        if args.command == "create":
            task_id = create_manual(connection, args.title.strip() or "PA6 smoke task")
            print(f"created manual task #{task_id}: {args.title}")
        elif args.command == "complete":
            task_id = complete_task(connection, args.id)
            print(f"completed task #{task_id}" if task_id else "no manual task to complete")
        elif args.command == "stuck-codex":
            task_id = create_stuck_codex(
                connection,
                args.title.strip() or "PA6 stuck Codex smoke",
                max(0, args.age_minutes),
                args.cwd,
            )
            print(f"created stuck codex task #{task_id}: {args.title}")
        connection.commit()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
