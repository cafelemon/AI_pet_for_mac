import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  CodexRenderState,
  CreateTaskInput,
  TaskCenterSnapshot,
  TaskNotification,
  TaskPluginConfig,
  TaskRecord,
  TaskSource,
  TaskStatus
} from '../shared/types';

export const DEFAULT_TASK_PLUGIN_CONFIG: TaskPluginConfig = {
  enabled: true,
  databasePath: 'data/sqlite/tasks.db',
  pollIntervalMs: 1000,
  stuckThresholdMs: 180000,
  recentLimit: 8
};

const TASK_SOURCES = new Set<TaskSource>(['manual', 'codex']);
const TASK_STATUSES = new Set<TaskStatus>(['todo', 'active', 'blocked', 'done', 'failed']);
const ACTIVE_CODEX_STATUSES = new Set<CodexRenderState['state']>(['coding', 'thinking', 'waiting_auth']);

interface SqlTaskRow {
  id: number;
  title: string;
  source: string;
  status: string;
  task_date: string;
  cwd: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  completed_at: string | null;
  stuck_notified_at: string | null;
}

function expandHomePath(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function resolveDataPath(projectRoot: string, path: string): string {
  const expandedPath = expandHomePath(path);
  return isAbsolute(expandedPath) ? expandedPath : resolve(projectRoot, expandedPath);
}

function nowIso(): string {
  return new Date().toISOString();
}

function localTaskDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTitle(title: string): string {
  const nextTitle = title.trim();
  if (!nextTitle) {
    throw new Error('Task title is required.');
  }
  return nextTitle.slice(0, 120);
}

function normalizeTaskDate(taskDate: string | undefined): string {
  if (!taskDate) {
    return localTaskDate();
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(taskDate) ? taskDate : localTaskDate();
}

function normalizeTaskStatus(status: string): TaskStatus {
  return TASK_STATUSES.has(status as TaskStatus) ? (status as TaskStatus) : 'todo';
}

function normalizeTaskSource(source: string): TaskSource {
  return TASK_SOURCES.has(source as TaskSource) ? (source as TaskSource) : 'manual';
}

function timestampMs(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function codexTaskTitle(state: CodexRenderState): string {
  return normalizeTitle(state.task ?? state.message ?? state.toolName ?? state.cwd ?? 'Codex 当前任务');
}

function taskMessage(task: TaskRecord): string {
  return `任务可能卡住了：${task.title}`;
}

function mapTaskRow(row: SqlTaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    source: normalizeTaskSource(row.source),
    status: normalizeTaskStatus(row.status),
    taskDate: row.task_date,
    cwd: row.cwd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at,
    stuckNotifiedAt: row.stuck_notified_at
  };
}

export class TaskService {
  private db: DatabaseSync | null = null;
  private readonly databasePath: string;

  constructor(
    private readonly config: TaskPluginConfig,
    projectRoot: string
  ) {
    this.databasePath = resolveDataPath(projectRoot, config.databasePath);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  get pollIntervalMs(): number {
    return Math.max(250, this.config.pollIntervalMs);
  }

  get stuckThresholdMs(): number {
    return Math.max(30000, this.config.stuckThresholdMs);
  }

  get recentLimit(): number {
    return Math.max(1, Math.min(50, Math.round(this.config.recentLimit)));
  }

  init(): void {
    if (!this.enabled) {
      return;
    }

    mkdirSync(dirname(this.databasePath), { recursive: true });
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec(`
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
    `);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  snapshot(): TaskCenterSnapshot {
    if (!this.db) {
      return {
        today: [],
        currentCodex: null,
        recentCompleted: []
      };
    }

    const today = this.db
      .prepare(
        `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE task_date = ? AND status NOT IN ('done', 'failed')
          ORDER BY
            CASE status WHEN 'active' THEN 0 WHEN 'blocked' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
            updated_at DESC
        `
      )
      .all(localTaskDate()) as unknown as SqlTaskRow[];
    const recentCompleted = this.db
      .prepare(
        `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE status IN ('done', 'failed')
          ORDER BY COALESCE(completed_at, updated_at) DESC
          LIMIT ?
        `
      )
      .all(this.recentLimit) as unknown as SqlTaskRow[];

    return {
      today: today.map(mapTaskRow),
      currentCodex: this.getCurrentCodexTask(),
      recentCompleted: recentCompleted.map(mapTaskRow)
    };
  }

  createTask(input: CreateTaskInput): TaskRecord {
    const db = this.requireDb();
    const createdAt = nowIso();
    const title = normalizeTitle(input.title);
    const taskDate = normalizeTaskDate(input.taskDate);
    const result = db
      .prepare(
        `
          INSERT INTO tasks (title, source, status, task_date, created_at, updated_at)
          VALUES (?, 'manual', 'todo', ?, ?, ?)
          RETURNING id
        `
      )
      .get(title, taskDate, createdAt, createdAt) as { id: number };

    return this.getTask(result.id) ?? {
      id: result.id,
      title,
      source: 'manual',
      status: 'todo',
      taskDate,
      cwd: null,
      createdAt,
      updatedAt: createdAt,
      lastActivityAt: null,
      completedAt: null,
      stuckNotifiedAt: null
    };
  }

  updateTaskStatus(id: number, status: TaskStatus): TaskRecord | null {
    if (!TASK_STATUSES.has(status)) {
      return null;
    }

    const db = this.requireDb();
    const updatedAt = nowIso();
    const completedAt = status === 'done' || status === 'failed' ? updatedAt : null;
    db.prepare(
      `
        UPDATE tasks
        SET status = ?, updated_at = ?, completed_at = ?, stuck_notified_at = CASE WHEN ? = 'blocked' THEN stuck_notified_at ELSE NULL END
        WHERE id = ?
      `
    ).run(status, updatedAt, completedAt, status, id);
    return this.getTask(id);
  }

  deleteTask(id: number): boolean {
    const db = this.requireDb();
    const result = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  handleCodexState(state: CodexRenderState | null): TaskRecord | null {
    if (!this.db || !state || state.isStale || state.state === 'idle') {
      return null;
    }

    if (ACTIVE_CODEX_STATUSES.has(state.state)) {
      return this.upsertActiveCodexTask(state);
    }

    if (state.state === 'success') {
      return this.finishCurrentCodexTask('done', state);
    }

    if (state.state === 'error') {
      return this.finishCurrentCodexTask('failed', state);
    }

    return null;
  }

  consumeStuckNotification(now = new Date()): TaskNotification | null {
    if (!this.db) {
      return null;
    }

    const thresholdMs = now.getTime() - this.stuckThresholdMs;
    const rows = this.db
      .prepare(
        `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE source = 'codex'
            AND status = 'active'
            AND last_activity_at IS NOT NULL
            AND stuck_notified_at IS NULL
          ORDER BY last_activity_at ASC
        `
      )
      .all() as unknown as SqlTaskRow[];
    const row = rows.find((candidate) => timestampMs(candidate.last_activity_at) <= thresholdMs);

    if (!row) {
      return null;
    }

    const notifiedAt = nowIso();
    this.db
      .prepare(`UPDATE tasks SET status = 'blocked', stuck_notified_at = ?, updated_at = ? WHERE id = ?`)
      .run(notifiedAt, notifiedAt, row.id);
    const task = this.getTask(row.id) ?? mapTaskRow({ ...row, status: 'blocked', stuck_notified_at: notifiedAt });

    return {
      source: 'task',
      state: 'reminder',
      message: taskMessage(task),
      task,
      timestamp: notifiedAt,
      isStale: false
    };
  }

  dismissTaskNotification(id: number): TaskRecord | null {
    return this.getTask(id);
  }

  private upsertActiveCodexTask(state: CodexRenderState): TaskRecord {
    const db = this.requireDb();
    const active = this.getCurrentCodexTask();
    const updatedAt = nowIso();
    const activityAt = state.timestamp ?? updatedAt;
    const title = state.task ? codexTaskTitle(state) : (active?.title ?? codexTaskTitle(state));

    if (!active) {
      const result = db
        .prepare(
          `
            INSERT INTO tasks (title, source, status, task_date, cwd, created_at, updated_at, last_activity_at)
            VALUES (?, 'codex', 'active', ?, ?, ?, ?, ?)
            RETURNING id
          `
        )
        .get(title, localTaskDate(), state.cwd, updatedAt, updatedAt, activityAt) as { id: number };
      return this.getTask(result.id) as TaskRecord;
    }

    const nextActivityAt =
      !active.lastActivityAt || timestampMs(activityAt) > timestampMs(active.lastActivityAt)
        ? activityAt
        : active.lastActivityAt;
    db.prepare(
      `
        UPDATE tasks
        SET title = ?, status = 'active', task_date = ?, cwd = COALESCE(?, cwd), updated_at = ?,
            last_activity_at = ?, stuck_notified_at = NULL
        WHERE id = ?
      `
    ).run(title, localTaskDate(), state.cwd, updatedAt, nextActivityAt, active.id);
    return this.getTask(active.id) as TaskRecord;
  }

  private finishCurrentCodexTask(status: Extract<TaskStatus, 'done' | 'failed'>, state: CodexRenderState): TaskRecord {
    const db = this.requireDb();
    const active = this.getCurrentCodexTask();
    const updatedAt = nowIso();
    const completedAt = state.timestamp ?? updatedAt;
    const title = state.task ? codexTaskTitle(state) : (active?.title ?? codexTaskTitle(state));

    if (!active) {
      const result = db
        .prepare(
          `
            INSERT INTO tasks (title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at)
            VALUES (?, 'codex', ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `
        )
        .get(title, status, localTaskDate(), state.cwd, updatedAt, updatedAt, completedAt, completedAt) as { id: number };
      return this.getTask(result.id) as TaskRecord;
    }

    db.prepare(
      `
        UPDATE tasks
        SET title = ?, status = ?, task_date = ?, cwd = COALESCE(?, cwd), updated_at = ?,
            last_activity_at = ?, completed_at = ?, stuck_notified_at = NULL
        WHERE id = ?
      `
    ).run(title, status, localTaskDate(), state.cwd, updatedAt, completedAt, completedAt, active.id);
    return this.getTask(active.id) as TaskRecord;
  }

  private getCurrentCodexTask(): TaskRecord | null {
    if (!this.db) {
      return null;
    }

    const row = this.db
      .prepare(
        `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE source = 'codex' AND status IN ('active', 'blocked')
          ORDER BY updated_at DESC
          LIMIT 1
        `
      )
      .get() as SqlTaskRow | undefined;

    return row ? mapTaskRow(row) : null;
  }

  private getTask(id: number): TaskRecord | null {
    if (!this.db) {
      return null;
    }

    const row = this.db
      .prepare(
        `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE id = ?
        `
      )
      .get(id) as SqlTaskRow | undefined;

    return row ? mapTaskRow(row) : null;
  }

  private requireDb(): DatabaseSync {
    if (!this.db) {
      throw new Error('Task service is disabled.');
    }
    return this.db;
  }
}
