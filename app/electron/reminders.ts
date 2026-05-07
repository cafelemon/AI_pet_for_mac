import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  CreateReminderInput,
  ReminderNotification,
  ReminderPluginConfig,
  ReminderPriority,
  ReminderRecord,
  ReminderRepeatRule,
  ReminderStatus
} from '../shared/types';

export const DEFAULT_REMINDER_PLUGIN_CONFIG: ReminderPluginConfig = {
  enabled: true,
  databasePath: 'data/sqlite/reminders.db',
  pollIntervalMs: 1000,
  defaultSnoozeMinutes: 10,
  quickCreateMinutes: [5, 15, 30]
};

const PRIORITY_TO_RANK: Record<ReminderPriority, number> = {
  high: 0,
  normal: 1,
  low: 2
};
const RANK_TO_PRIORITY: Record<number, ReminderPriority> = {
  0: 'high',
  1: 'normal',
  2: 'low'
};
const REPEAT_RULES = new Set<ReminderRepeatRule>(['none', 'daily', 'weekly', 'monthly']);
const PRIORITIES = new Set<ReminderPriority>(['high', 'normal', 'low']);
const STATUSES = new Set<ReminderStatus>(['scheduled', 'triggered', 'dismissed']);

interface SqlReminderRow {
  id: number;
  title: string;
  due_at: string;
  repeat_rule: string;
  priority: number;
  status: string;
  created_at: string;
  updated_at: string;
  triggered_at: string | null;
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

function normalizeTitle(title: string): string {
  const nextTitle = title.trim();
  if (!nextTitle) {
    throw new Error('Reminder title is required.');
  }
  return nextTitle.slice(0, 80);
}

function normalizeDueAt(dueAt: string): string {
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Reminder dueAt is invalid.');
  }
  return parsed.toISOString();
}

function normalizeRepeatRule(rule: string | undefined): ReminderRepeatRule {
  return REPEAT_RULES.has(rule as ReminderRepeatRule) ? (rule as ReminderRepeatRule) : 'none';
}

function normalizePriority(priority: string | undefined): ReminderPriority {
  return PRIORITIES.has(priority as ReminderPriority) ? (priority as ReminderPriority) : 'normal';
}

function normalizeStatus(status: string): ReminderStatus {
  return STATUSES.has(status as ReminderStatus) ? (status as ReminderStatus) : 'scheduled';
}

function addRepeatInterval(date: Date, repeatRule: ReminderRepeatRule): Date {
  const nextDate = new Date(date);
  if (repeatRule === 'daily') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  } else if (repeatRule === 'weekly') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else if (repeatRule === 'monthly') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  }
  return nextDate;
}

function nextRepeatDueAt(dueAt: string, repeatRule: ReminderRepeatRule, now: Date): string {
  if (repeatRule === 'none') {
    return dueAt;
  }

  let nextDate = new Date(dueAt);
  if (Number.isNaN(nextDate.getTime())) {
    nextDate = new Date(now);
  }

  while (nextDate <= now) {
    nextDate = addRepeatInterval(nextDate, repeatRule);
  }

  return nextDate.toISOString();
}

function reminderMessage(reminder: ReminderRecord): string {
  return `提醒：${reminder.title}`;
}

function mapReminderRow(row: SqlReminderRow): ReminderRecord {
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    repeatRule: normalizeRepeatRule(row.repeat_rule),
    priority: RANK_TO_PRIORITY[row.priority] ?? 'normal',
    status: normalizeStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    triggeredAt: row.triggered_at
  };
}

export class ReminderService {
  private db: DatabaseSync | null = null;
  private readonly databasePath: string;

  constructor(
    private readonly config: ReminderPluginConfig,
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

  get defaultSnoozeMinutes(): number {
    return Math.max(1, Math.round(this.config.defaultSnoozeMinutes));
  }

  get quickCreateMinutes(): number[] {
    return this.config.quickCreateMinutes
      .map((minutes) => Math.round(minutes))
      .filter((minutes) => minutes > 0 && minutes <= 1440);
  }

  init(): void {
    if (!this.enabled) {
      return;
    }

    mkdirSync(dirname(this.databasePath), { recursive: true });
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec(`
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
    `);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  listReminders(): ReminderRecord[] {
    if (!this.db) {
      return [];
    }

    const rows = this.db
      .prepare(
        `
          SELECT id, title, due_at, repeat_rule, priority, status, created_at, updated_at, triggered_at
          FROM reminders
          WHERE status != 'dismissed'
          ORDER BY
            CASE status WHEN 'triggered' THEN 0 ELSE 1 END,
            due_at ASC,
            priority ASC
          LIMIT 50
        `
      )
      .all() as unknown as SqlReminderRow[];

    return rows.map(mapReminderRow);
  }

  createReminder(input: CreateReminderInput): ReminderRecord {
    const db = this.requireDb();
    const createdAt = nowIso();
    const title = normalizeTitle(input.title);
    const dueAt = normalizeDueAt(input.dueAt);
    const repeatRule = normalizeRepeatRule(input.repeatRule);
    const priority = normalizePriority(input.priority);
    const result = db
      .prepare(
        `
          INSERT INTO reminders (title, due_at, repeat_rule, priority, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'scheduled', ?, ?)
          RETURNING id
        `
      )
      .get(title, dueAt, repeatRule, PRIORITY_TO_RANK[priority], createdAt, createdAt) as { id: number };

    return this.getReminder(result.id) ?? {
      id: result.id,
      title,
      dueAt,
      repeatRule,
      priority,
      status: 'scheduled',
      createdAt,
      updatedAt: createdAt,
      triggeredAt: null
    };
  }

  createQuickReminder(minutes: number): ReminderRecord {
    const safeMinutes = Math.max(1, Math.min(1440, Math.round(minutes)));
    return this.createReminder({
      title: `${safeMinutes} 分钟后提醒`,
      dueAt: new Date(Date.now() + safeMinutes * 60_000).toISOString(),
      repeatRule: 'none',
      priority: 'normal'
    });
  }

  dismissReminder(id: number): ReminderRecord | null {
    const db = this.requireDb();
    const updatedAt = nowIso();
    db.prepare(`UPDATE reminders SET status = 'dismissed', updated_at = ? WHERE id = ?`).run(updatedAt, id);
    return this.getReminder(id);
  }

  dismissNotification(id: number): ReminderRecord | null {
    const reminder = this.getReminder(id);
    if (!reminder) {
      return null;
    }

    if (reminder.repeatRule === 'none') {
      return this.dismissReminder(id);
    }

    return reminder;
  }

  snoozeReminder(id: number, minutes: number): ReminderRecord | null {
    const db = this.requireDb();
    const safeMinutes = Math.max(1, Math.min(1440, Math.round(minutes)));
    const dueAt = new Date(Date.now() + safeMinutes * 60_000).toISOString();
    const updatedAt = nowIso();
    db.prepare(
      `
        UPDATE reminders
        SET due_at = ?, status = 'scheduled', triggered_at = NULL, updated_at = ?
        WHERE id = ?
      `
    ).run(dueAt, updatedAt, id);
    return this.getReminder(id);
  }

  consumeDueReminder(now = new Date()): ReminderNotification | null {
    if (!this.db) {
      return null;
    }

    const dueAt = now.toISOString();
    const row = this.db
      .prepare(
        `
          SELECT id, title, due_at, repeat_rule, priority, status, created_at, updated_at, triggered_at
          FROM reminders
          WHERE status = 'scheduled' AND due_at <= ?
          ORDER BY priority ASC, due_at ASC
          LIMIT 1
        `
      )
      .get(dueAt) as SqlReminderRow | undefined;

    if (!row) {
      return null;
    }

    const reminder = mapReminderRow(row);
    const triggeredAt = nowIso();

    if (reminder.repeatRule === 'none') {
      this.db
        .prepare(`UPDATE reminders SET status = 'triggered', triggered_at = ?, updated_at = ? WHERE id = ?`)
        .run(triggeredAt, triggeredAt, reminder.id);
      reminder.status = 'triggered';
      reminder.triggeredAt = triggeredAt;
      reminder.updatedAt = triggeredAt;
    } else {
      this.db
        .prepare(`UPDATE reminders SET due_at = ?, triggered_at = ?, updated_at = ? WHERE id = ?`)
        .run(nextRepeatDueAt(reminder.dueAt, reminder.repeatRule, now), triggeredAt, triggeredAt, reminder.id);
      reminder.triggeredAt = triggeredAt;
      reminder.updatedAt = triggeredAt;
    }

    return {
      source: 'reminder',
      state: 'reminder',
      message: reminderMessage(reminder),
      reminder,
      timestamp: triggeredAt,
      isStale: false
    };
  }

  private getReminder(id: number): ReminderRecord | null {
    if (!this.db) {
      return null;
    }

    const row = this.db
      .prepare(
        `
          SELECT id, title, due_at, repeat_rule, priority, status, created_at, updated_at, triggered_at
          FROM reminders
          WHERE id = ?
        `
      )
      .get(id) as SqlReminderRow | undefined;

    return row ? mapReminderRow(row) : null;
  }

  private requireDb(): DatabaseSync {
    if (!this.db) {
      throw new Error('Reminder service is disabled.');
    }
    return this.db;
  }
}
