"use strict";
const electron = require("electron");
const node_fs = require("node:fs");
const promises = require("node:fs/promises");
const node_os = require("node:os");
const node_path = require("node:path");
const node_url = require("node:url");
const node_child_process = require("node:child_process");
const node_sqlite = require("node:sqlite");
class MacInputService {
  constructor(helperPath, onEvent, onStatus) {
    this.helperPath = helperPath;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
  }
  helperPath;
  onEvent;
  onStatus;
  child = null;
  stdoutBuffer = "";
  status = process.platform === "darwin" ? "unknown" : "denied";
  modifier = "Option";
  bounds = null;
  regions = [];
  start(modifier) {
    this.modifier = modifier || "Option";
    if (process.platform !== "darwin") {
      this.setStatus("denied");
      return;
    }
    this.stop();
    this.child = node_child_process.spawn("/usr/bin/swift", [this.helperPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      const message = chunk.trim();
      if (message) {
        console.warn(`Mac input helper: ${message}`);
      }
    });
    this.child.on("exit", (code) => {
      this.child = null;
      if (code !== 0 && this.status === "unknown") {
        this.setStatus("denied");
      }
    });
    this.child.on("error", (error) => {
      console.warn("Failed to start Mac input helper.", error);
      this.setStatus("denied");
    });
    this.send({ type: "config", modifier: this.modifier });
    this.syncHitRegions(this.bounds, this.regions);
  }
  stop() {
    if (!this.child) {
      return;
    }
    this.child.kill();
    this.child = null;
  }
  getStatus() {
    return this.status;
  }
  updateModifier(modifier) {
    this.modifier = modifier || "Option";
    this.send({ type: "config", modifier: this.modifier });
  }
  syncHitRegions(bounds, regions) {
    this.bounds = bounds;
    this.regions = regions;
    this.send({
      type: "regions",
      bounds,
      regions
    });
  }
  handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const event = JSON.parse(trimmed);
        if (event.type === "permission" && event.status) {
          this.setStatus(event.status);
          continue;
        }
        this.onEvent(event);
      } catch (error) {
        console.warn("Invalid Mac input helper payload ignored.", error);
      }
    }
  }
  setStatus(status) {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.onStatus(status);
  }
  send(payload) {
    if (!this.child || this.child.killed || !this.child.stdin.writable) {
      return;
    }
    this.child.stdin.write(`${JSON.stringify(payload)}
`);
  }
}
const DEFAULT_REMINDER_PLUGIN_CONFIG = {
  enabled: true,
  databasePath: "data/sqlite/reminders.db",
  pollIntervalMs: 1e3,
  defaultSnoozeMinutes: 10,
  quickCreateMinutes: [5, 15, 30]
};
const PRIORITY_TO_RANK = {
  high: 0,
  normal: 1,
  low: 2
};
const RANK_TO_PRIORITY = {
  0: "high",
  1: "normal",
  2: "low"
};
const REPEAT_RULES = /* @__PURE__ */ new Set(["none", "daily", "weekly", "monthly"]);
const PRIORITIES = /* @__PURE__ */ new Set(["high", "normal", "low"]);
const STATUSES = /* @__PURE__ */ new Set(["scheduled", "triggered", "dismissed"]);
function expandHomePath$2(path) {
  if (path === "~") {
    return node_os.homedir();
  }
  if (path.startsWith("~/")) {
    return node_path.join(node_os.homedir(), path.slice(2));
  }
  return path;
}
function resolveDataPath$1(projectRoot2, path) {
  const expandedPath = expandHomePath$2(path);
  return node_path.isAbsolute(expandedPath) ? expandedPath : node_path.resolve(projectRoot2, expandedPath);
}
function nowIso$1() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function normalizeTitle$1(title) {
  const nextTitle = title.trim();
  if (!nextTitle) {
    throw new Error("Reminder title is required.");
  }
  return nextTitle.slice(0, 80);
}
function normalizeDueAt(dueAt) {
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Reminder dueAt is invalid.");
  }
  return parsed.toISOString();
}
function normalizeRepeatRule(rule) {
  return REPEAT_RULES.has(rule) ? rule : "none";
}
function normalizePriority(priority) {
  return PRIORITIES.has(priority) ? priority : "normal";
}
function normalizeStatus(status) {
  return STATUSES.has(status) ? status : "scheduled";
}
function addRepeatInterval(date, repeatRule) {
  const nextDate = new Date(date);
  if (repeatRule === "daily") {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  } else if (repeatRule === "weekly") {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else if (repeatRule === "monthly") {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  }
  return nextDate;
}
function nextRepeatDueAt(dueAt, repeatRule, now) {
  if (repeatRule === "none") {
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
function reminderMessage(reminder) {
  return `提醒：${reminder.title}`;
}
function mapReminderRow(row) {
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    repeatRule: normalizeRepeatRule(row.repeat_rule),
    priority: RANK_TO_PRIORITY[row.priority] ?? "normal",
    status: normalizeStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    triggeredAt: row.triggered_at
  };
}
class ReminderService {
  constructor(config, projectRoot2) {
    this.config = config;
    this.databasePath = resolveDataPath$1(projectRoot2, config.databasePath);
  }
  config;
  db = null;
  databasePath;
  get enabled() {
    return this.config.enabled;
  }
  get pollIntervalMs() {
    return Math.max(250, this.config.pollIntervalMs);
  }
  get defaultSnoozeMinutes() {
    return Math.max(1, Math.round(this.config.defaultSnoozeMinutes));
  }
  get quickCreateMinutes() {
    return this.config.quickCreateMinutes.map((minutes) => Math.round(minutes)).filter((minutes) => minutes > 0 && minutes <= 1440);
  }
  init() {
    if (!this.enabled) {
      return;
    }
    node_fs.mkdirSync(node_path.dirname(this.databasePath), { recursive: true });
    this.db = new node_sqlite.DatabaseSync(this.databasePath);
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
  close() {
    this.db?.close();
    this.db = null;
  }
  listReminders() {
    if (!this.db) {
      return [];
    }
    const rows = this.db.prepare(
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
    ).all();
    return rows.map(mapReminderRow);
  }
  createReminder(input) {
    const db = this.requireDb();
    const createdAt = nowIso$1();
    const title = normalizeTitle$1(input.title);
    const dueAt = normalizeDueAt(input.dueAt);
    const repeatRule = normalizeRepeatRule(input.repeatRule);
    const priority = normalizePriority(input.priority);
    const result = db.prepare(
      `
          INSERT INTO reminders (title, due_at, repeat_rule, priority, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'scheduled', ?, ?)
          RETURNING id
        `
    ).get(title, dueAt, repeatRule, PRIORITY_TO_RANK[priority], createdAt, createdAt);
    return this.getReminder(result.id) ?? {
      id: result.id,
      title,
      dueAt,
      repeatRule,
      priority,
      status: "scheduled",
      createdAt,
      updatedAt: createdAt,
      triggeredAt: null
    };
  }
  createQuickReminder(minutes) {
    const safeMinutes = Math.max(1, Math.min(1440, Math.round(minutes)));
    return this.createReminder({
      title: `${safeMinutes} 分钟后提醒`,
      dueAt: new Date(Date.now() + safeMinutes * 6e4).toISOString(),
      repeatRule: "none",
      priority: "normal"
    });
  }
  dismissReminder(id) {
    const db = this.requireDb();
    const updatedAt = nowIso$1();
    db.prepare(`UPDATE reminders SET status = 'dismissed', updated_at = ? WHERE id = ?`).run(updatedAt, id);
    return this.getReminder(id);
  }
  dismissNotification(id) {
    const reminder = this.getReminder(id);
    if (!reminder) {
      return null;
    }
    if (reminder.repeatRule === "none") {
      return this.dismissReminder(id);
    }
    return reminder;
  }
  snoozeReminder(id, minutes) {
    const db = this.requireDb();
    const safeMinutes = Math.max(1, Math.min(1440, Math.round(minutes)));
    const dueAt = new Date(Date.now() + safeMinutes * 6e4).toISOString();
    const updatedAt = nowIso$1();
    db.prepare(
      `
        UPDATE reminders
        SET due_at = ?, status = 'scheduled', triggered_at = NULL, updated_at = ?
        WHERE id = ?
      `
    ).run(dueAt, updatedAt, id);
    return this.getReminder(id);
  }
  consumeDueReminder(now = /* @__PURE__ */ new Date()) {
    if (!this.db) {
      return null;
    }
    const dueAt = now.toISOString();
    const row = this.db.prepare(
      `
          SELECT id, title, due_at, repeat_rule, priority, status, created_at, updated_at, triggered_at
          FROM reminders
          WHERE status = 'scheduled' AND due_at <= ?
          ORDER BY priority ASC, due_at ASC
          LIMIT 1
        `
    ).get(dueAt);
    if (!row) {
      return null;
    }
    const reminder = mapReminderRow(row);
    const triggeredAt = nowIso$1();
    if (reminder.repeatRule === "none") {
      this.db.prepare(`UPDATE reminders SET status = 'triggered', triggered_at = ?, updated_at = ? WHERE id = ?`).run(triggeredAt, triggeredAt, reminder.id);
      reminder.status = "triggered";
      reminder.triggeredAt = triggeredAt;
      reminder.updatedAt = triggeredAt;
    } else {
      this.db.prepare(`UPDATE reminders SET due_at = ?, triggered_at = ?, updated_at = ? WHERE id = ?`).run(nextRepeatDueAt(reminder.dueAt, reminder.repeatRule, now), triggeredAt, triggeredAt, reminder.id);
      reminder.triggeredAt = triggeredAt;
      reminder.updatedAt = triggeredAt;
    }
    return {
      source: "reminder",
      state: "reminder",
      message: reminderMessage(reminder),
      reminder,
      timestamp: triggeredAt,
      isStale: false
    };
  }
  getReminder(id) {
    if (!this.db) {
      return null;
    }
    const row = this.db.prepare(
      `
          SELECT id, title, due_at, repeat_rule, priority, status, created_at, updated_at, triggered_at
          FROM reminders
          WHERE id = ?
        `
    ).get(id);
    return row ? mapReminderRow(row) : null;
  }
  requireDb() {
    if (!this.db) {
      throw new Error("Reminder service is disabled.");
    }
    return this.db;
  }
}
const DEFAULT_SHORTCUTS = [
  {
    id: "control-center.toggle",
    label: "打开/关闭控制中心",
    accelerator: "CommandOrControl+Shift+Space",
    defaultAccelerator: "CommandOrControl+Shift+Space",
    editable: true,
    enabled: true
  },
  {
    id: "control-center.status",
    label: "打开状态切换",
    accelerator: "F2",
    defaultAccelerator: "F2",
    editable: true,
    enabled: false
  },
  {
    id: "control-center.settings",
    label: "打开设置",
    accelerator: "F3",
    defaultAccelerator: "F3",
    editable: true,
    enabled: false
  },
  {
    id: "control-center.reminders",
    label: "打开提醒",
    accelerator: "F4",
    defaultAccelerator: "F4",
    editable: true,
    enabled: false
  },
  {
    id: "control-center.tasks",
    label: "打开任务中心",
    accelerator: "F5",
    defaultAccelerator: "F5",
    editable: true,
    enabled: false
  },
  {
    id: "pet.interactionModifier",
    label: "宠物鼠标交互修饰键",
    accelerator: "Option",
    defaultAccelerator: "Option",
    editable: true,
    enabled: true
  }
];
function shortcutSettingsPath() {
  return node_path.join(node_os.homedir(), ".desktop-ai-companion", "settings", "shortcuts.json");
}
function moduleForShortcutId(id) {
  switch (id) {
    case "control-center.status":
      return "status";
    case "control-center.reminders":
      return "reminders";
    case "control-center.tasks":
      return "tasks";
    case "control-center.settings":
      return "settings";
    default:
      return null;
  }
}
function normalizeAccelerator(accelerator) {
  return accelerator.trim().replace(/\s+/g, "");
}
function cloneBinding(binding) {
  return { ...binding };
}
function mergeBinding(defaultBinding, override) {
  const accelerator = typeof override.accelerator === "string" ? normalizeAccelerator(override.accelerator) : defaultBinding.accelerator;
  const enabled = typeof override.enabled === "boolean" ? override.enabled : defaultBinding.enabled;
  return {
    ...defaultBinding,
    accelerator,
    enabled
  };
}
class ShortcutService {
  constructor(settingsPath = shortcutSettingsPath()) {
    this.settingsPath = settingsPath;
  }
  settingsPath;
  bindings = DEFAULT_SHORTCUTS.map(cloneBinding);
  registeredAccelerators = [];
  async load() {
    try {
      const raw = await promises.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      const overrides = new Map((parsed.shortcuts ?? []).filter((binding) => binding.id).map((binding) => [binding.id, binding]));
      this.bindings = DEFAULT_SHORTCUTS.map((binding) => {
        const override = overrides.get(binding.id);
        return override ? mergeBinding(binding, override) : cloneBinding(binding);
      });
      this.validateDuplicates(this.bindings);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        this.bindings = DEFAULT_SHORTCUTS.map(cloneBinding);
        return;
      }
      console.warn("Failed to load shortcut settings; using defaults.", error);
      this.bindings = DEFAULT_SHORTCUTS.map(cloneBinding);
    }
  }
  list() {
    return this.bindings.map(cloneBinding);
  }
  interactionModifier() {
    return this.bindings.find((binding) => binding.id === "pet.interactionModifier")?.accelerator ?? "Option";
  }
  async updateShortcut(id, accelerator) {
    const nextBindings = this.bindings.map((binding) => {
      if (binding.id !== id) {
        return cloneBinding(binding);
      }
      if (!binding.editable) {
        throw new Error("快捷键不可编辑");
      }
      const nextAccelerator = normalizeAccelerator(accelerator);
      return {
        ...binding,
        accelerator: nextAccelerator || binding.defaultAccelerator,
        enabled: nextAccelerator.length > 0
      };
    });
    if (!nextBindings.some((binding) => binding.id === id)) {
      throw new Error("未知快捷键");
    }
    this.validateDuplicates(nextBindings);
    this.bindings = nextBindings;
    await this.save();
    return this.list();
  }
  async resetShortcut(id) {
    const defaultBinding = DEFAULT_SHORTCUTS.find((binding) => binding.id === id);
    if (!defaultBinding) {
      throw new Error("未知快捷键");
    }
    this.bindings = this.bindings.map((binding) => binding.id === id ? cloneBinding(defaultBinding) : cloneBinding(binding));
    this.validateDuplicates(this.bindings);
    await this.save();
    return this.list();
  }
  register(actions) {
    this.unregister();
    for (const binding of this.bindings) {
      if (!binding.enabled || binding.id === "pet.interactionModifier") {
        continue;
      }
      const action = actions.get(binding.id);
      if (!action) {
        continue;
      }
      const registered = electron.globalShortcut.register(binding.accelerator, action);
      if (registered) {
        this.registeredAccelerators.push(binding.accelerator);
      } else {
        console.warn(`Failed to register shortcut: ${binding.label} (${binding.accelerator})`);
      }
    }
  }
  unregister() {
    for (const accelerator of this.registeredAccelerators) {
      electron.globalShortcut.unregister(accelerator);
    }
    this.registeredAccelerators = [];
  }
  validateDuplicates(bindings) {
    const seen = /* @__PURE__ */ new Map();
    for (const binding of bindings) {
      if (!binding.enabled || binding.id === "pet.interactionModifier") {
        continue;
      }
      const key = binding.accelerator.toLowerCase();
      const duplicate = seen.get(key);
      if (duplicate) {
        throw new Error(`快捷键冲突：${duplicate} / ${binding.label}`);
      }
      seen.set(key, binding.label);
    }
  }
  async save() {
    await promises.mkdir(node_path.dirname(this.settingsPath), { recursive: true });
    await promises.writeFile(
      this.settingsPath,
      `${JSON.stringify(
        {
          shortcuts: this.bindings.map(({ id, accelerator, enabled }) => ({ id, accelerator, enabled }))
        },
        null,
        2
      )}
`,
      "utf8"
    );
  }
}
const DEFAULT_TASK_PLUGIN_CONFIG = {
  enabled: true,
  databasePath: "data/sqlite/tasks.db",
  pollIntervalMs: 1e3,
  stuckThresholdMs: 18e4,
  recentLimit: 8
};
const TASK_SOURCES = /* @__PURE__ */ new Set(["manual", "codex"]);
const TASK_STATUSES = /* @__PURE__ */ new Set(["todo", "active", "blocked", "done", "failed"]);
const ACTIVE_CODEX_STATUSES = /* @__PURE__ */ new Set(["coding", "thinking", "waiting_auth"]);
function expandHomePath$1(path) {
  if (path === "~") {
    return node_os.homedir();
  }
  if (path.startsWith("~/")) {
    return node_path.join(node_os.homedir(), path.slice(2));
  }
  return path;
}
function resolveDataPath(projectRoot2, path) {
  const expandedPath = expandHomePath$1(path);
  return node_path.isAbsolute(expandedPath) ? expandedPath : node_path.resolve(projectRoot2, expandedPath);
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function localTaskDate(date = /* @__PURE__ */ new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function normalizeTitle(title) {
  const nextTitle = title.trim();
  if (!nextTitle) {
    throw new Error("Task title is required.");
  }
  return nextTitle.slice(0, 120);
}
function normalizeTaskDate(taskDate) {
  if (!taskDate) {
    return localTaskDate();
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(taskDate) ? taskDate : localTaskDate();
}
function normalizeTaskStatus(status) {
  return TASK_STATUSES.has(status) ? status : "todo";
}
function normalizeTaskSource(source) {
  return TASK_SOURCES.has(source) ? source : "manual";
}
function timestampMs$1(value) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
function codexTaskTitle(state) {
  return normalizeTitle(state.task ?? state.message ?? state.toolName ?? state.cwd ?? "Codex 当前任务");
}
function taskMessage(task) {
  return `任务可能卡住了：${task.title}`;
}
function mapTaskRow(row) {
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
class TaskService {
  constructor(config, projectRoot2) {
    this.config = config;
    this.databasePath = resolveDataPath(projectRoot2, config.databasePath);
  }
  config;
  db = null;
  databasePath;
  get enabled() {
    return this.config.enabled;
  }
  get pollIntervalMs() {
    return Math.max(250, this.config.pollIntervalMs);
  }
  get stuckThresholdMs() {
    return Math.max(3e4, this.config.stuckThresholdMs);
  }
  get recentLimit() {
    return Math.max(1, Math.min(50, Math.round(this.config.recentLimit)));
  }
  init() {
    if (!this.enabled) {
      return;
    }
    node_fs.mkdirSync(node_path.dirname(this.databasePath), { recursive: true });
    this.db = new node_sqlite.DatabaseSync(this.databasePath);
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
  close() {
    this.db?.close();
    this.db = null;
  }
  snapshot() {
    if (!this.db) {
      return {
        today: [],
        currentCodex: null,
        recentCompleted: []
      };
    }
    const today = this.db.prepare(
      `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE task_date = ? AND status NOT IN ('done', 'failed')
          ORDER BY
            CASE status WHEN 'active' THEN 0 WHEN 'blocked' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
            updated_at DESC
        `
    ).all(localTaskDate());
    const recentCompleted = this.db.prepare(
      `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE status IN ('done', 'failed')
          ORDER BY COALESCE(completed_at, updated_at) DESC
          LIMIT ?
        `
    ).all(this.recentLimit);
    return {
      today: today.map(mapTaskRow),
      currentCodex: this.getCurrentCodexTask(),
      recentCompleted: recentCompleted.map(mapTaskRow)
    };
  }
  createTask(input) {
    const db = this.requireDb();
    const createdAt = nowIso();
    const title = normalizeTitle(input.title);
    const taskDate = normalizeTaskDate(input.taskDate);
    const result = db.prepare(
      `
          INSERT INTO tasks (title, source, status, task_date, created_at, updated_at)
          VALUES (?, 'manual', 'todo', ?, ?, ?)
          RETURNING id
        `
    ).get(title, taskDate, createdAt, createdAt);
    return this.getTask(result.id) ?? {
      id: result.id,
      title,
      source: "manual",
      status: "todo",
      taskDate,
      cwd: null,
      createdAt,
      updatedAt: createdAt,
      lastActivityAt: null,
      completedAt: null,
      stuckNotifiedAt: null
    };
  }
  updateTaskStatus(id, status) {
    if (!TASK_STATUSES.has(status)) {
      return null;
    }
    const db = this.requireDb();
    const updatedAt = nowIso();
    const completedAt = status === "done" || status === "failed" ? updatedAt : null;
    db.prepare(
      `
        UPDATE tasks
        SET status = ?, updated_at = ?, completed_at = ?, stuck_notified_at = CASE WHEN ? = 'blocked' THEN stuck_notified_at ELSE NULL END
        WHERE id = ?
      `
    ).run(status, updatedAt, completedAt, status, id);
    return this.getTask(id);
  }
  deleteTask(id) {
    const db = this.requireDb();
    const result = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
    return result.changes > 0;
  }
  handleCodexState(state) {
    if (!this.db || !state || state.isStale || state.state === "idle") {
      return null;
    }
    if (ACTIVE_CODEX_STATUSES.has(state.state)) {
      return this.upsertActiveCodexTask(state);
    }
    if (state.state === "success") {
      return this.finishCurrentCodexTask("done", state);
    }
    if (state.state === "error") {
      return this.finishCurrentCodexTask("failed", state);
    }
    return null;
  }
  consumeStuckNotification(now = /* @__PURE__ */ new Date()) {
    if (!this.db) {
      return null;
    }
    const thresholdMs = now.getTime() - this.stuckThresholdMs;
    const rows = this.db.prepare(
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
    ).all();
    const row = rows.find((candidate) => timestampMs$1(candidate.last_activity_at) <= thresholdMs);
    if (!row) {
      return null;
    }
    const notifiedAt = nowIso();
    this.db.prepare(`UPDATE tasks SET status = 'blocked', stuck_notified_at = ?, updated_at = ? WHERE id = ?`).run(notifiedAt, notifiedAt, row.id);
    const task = this.getTask(row.id) ?? mapTaskRow({ ...row, status: "blocked", stuck_notified_at: notifiedAt });
    return {
      source: "task",
      state: "reminder",
      message: taskMessage(task),
      task,
      timestamp: notifiedAt,
      isStale: false
    };
  }
  dismissTaskNotification(id) {
    return this.getTask(id);
  }
  upsertActiveCodexTask(state) {
    const db = this.requireDb();
    const active = this.getCurrentCodexTask();
    const updatedAt = nowIso();
    const activityAt = state.timestamp ?? updatedAt;
    const title = state.task ? codexTaskTitle(state) : active?.title ?? codexTaskTitle(state);
    if (!active) {
      const result = db.prepare(
        `
            INSERT INTO tasks (title, source, status, task_date, cwd, created_at, updated_at, last_activity_at)
            VALUES (?, 'codex', 'active', ?, ?, ?, ?, ?)
            RETURNING id
          `
      ).get(title, localTaskDate(), state.cwd, updatedAt, updatedAt, activityAt);
      return this.getTask(result.id);
    }
    const nextActivityAt = !active.lastActivityAt || timestampMs$1(activityAt) > timestampMs$1(active.lastActivityAt) ? activityAt : active.lastActivityAt;
    db.prepare(
      `
        UPDATE tasks
        SET title = ?, status = 'active', task_date = ?, cwd = COALESCE(?, cwd), updated_at = ?,
            last_activity_at = ?, stuck_notified_at = NULL
        WHERE id = ?
      `
    ).run(title, localTaskDate(), state.cwd, updatedAt, nextActivityAt, active.id);
    return this.getTask(active.id);
  }
  finishCurrentCodexTask(status, state) {
    const db = this.requireDb();
    const active = this.getCurrentCodexTask();
    const updatedAt = nowIso();
    const completedAt = state.timestamp ?? updatedAt;
    const title = state.task ? codexTaskTitle(state) : active?.title ?? codexTaskTitle(state);
    if (!active) {
      const result = db.prepare(
        `
            INSERT INTO tasks (title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at)
            VALUES (?, 'codex', ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `
      ).get(title, status, localTaskDate(), state.cwd, updatedAt, updatedAt, completedAt, completedAt);
      return this.getTask(result.id);
    }
    db.prepare(
      `
        UPDATE tasks
        SET title = ?, status = ?, task_date = ?, cwd = COALESCE(?, cwd), updated_at = ?,
            last_activity_at = ?, completed_at = ?, stuck_notified_at = NULL
        WHERE id = ?
      `
    ).run(title, status, localTaskDate(), state.cwd, updatedAt, completedAt, completedAt, active.id);
    return this.getTask(active.id);
  }
  getCurrentCodexTask() {
    if (!this.db) {
      return null;
    }
    const row = this.db.prepare(
      `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE source = 'codex' AND status IN ('active', 'blocked')
          ORDER BY updated_at DESC
          LIMIT 1
        `
    ).get();
    return row ? mapTaskRow(row) : null;
  }
  getTask(id) {
    if (!this.db) {
      return null;
    }
    const row = this.db.prepare(
      `
          SELECT id, title, source, status, task_date, cwd, created_at, updated_at, last_activity_at, completed_at,
                 stuck_notified_at
          FROM tasks
          WHERE id = ?
        `
    ).get(id);
    return row ? mapTaskRow(row) : null;
  }
  requireDb() {
    if (!this.db) {
      throw new Error("Task service is disabled.");
    }
    return this.db;
  }
}
const WINDOW_WIDTH = 512;
const WINDOW_HEIGHT = 576;
const ASSET_SCHEME = "companion-asset";
const COMPANION_COMMAND_CHANNEL = "companion:command";
const CODEX_RUNTIME_STATE_CHANNEL = "codex:runtime-state";
const REMINDER_RUNTIME_STATE_CHANNEL = "reminder:runtime-state";
const REMINDERS_UPDATED_CHANNEL = "reminder:updated";
const TASK_NOTIFICATION_CHANNEL = "task:notification";
const TASKS_UPDATED_CHANNEL = "task:updated";
const MOUSE_HIT_TEST_SAMPLE_CHANNEL = "mouse:hit-test-sample";
const MANUAL_RENDER_SELECTION_CHANNEL = "render:manual-selection";
const PET_PROFILE_CHANGED_CHANNEL = "pet-profile:changed";
const CONTROL_CENTER_MODULE_CHANNEL = "control-center:module";
const SHORTCUTS_UPDATED_CHANNEL = "shortcuts:updated";
const INPUT_PERMISSION_STATUS_CHANNEL = "input-permission:status";
const INTERACTION_DRAG_ACTIVE_CHANNEL = "interaction:drag-active";
const MAX_MOUSE_HIT_REGIONS = 2400;
const CONTROL_CENTER_WIDTH = 420;
const CONTROL_CENTER_HEIGHT = 560;
const DEFAULT_WINDOW_CONTROLS = {
  scale: 1,
  mouseMode: "smart",
  mousePassthrough: true
};
const DEFAULT_CODEX_PLUGIN_CONFIG = {
  enabled: true,
  runtimeStatePath: "~/.desktop-ai-companion/runtime_state/codex_state.json",
  pollIntervalMs: 1e3,
  thinkingTimeoutMs: 3e4,
  successHoldMs: 4e3,
  errorHoldMs: 8e3
};
const CODEX_RUNTIME_STATES = /* @__PURE__ */ new Set([
  "idle",
  "coding",
  "thinking",
  "waiting_auth",
  "success",
  "error"
]);
const COMPANION_STATES = /* @__PURE__ */ new Set([
  "idle",
  "reading",
  "coding",
  "thinking",
  "waiting_auth",
  "success",
  "error",
  "reminder",
  "sleep"
]);
electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);
function hasProjectAssets(candidate) {
  return node_fs.existsSync(node_path.join(candidate, "data", "config", "companion.config.json")) && node_fs.existsSync(node_path.join(candidate, "assets"));
}
function resolveProjectRoot() {
  const candidates = [
    process.env.DESKTOP_AI_COMPANION_ROOT,
    process.cwd(),
    electron.app.getAppPath(),
    node_path.resolve(__dirname, "../.."),
    node_path.resolve(__dirname, "../../..")
  ].filter((candidate) => Boolean(candidate));
  for (const candidate of candidates) {
    const absoluteCandidate = node_path.resolve(candidate);
    if (hasProjectAssets(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }
  return electron.app.getAppPath();
}
const projectRoot = resolveProjectRoot();
let activeProfileId = "legacy_real";
let activeCompanionConfig = null;
let mainWindowRef = null;
let controlCenterWindowRef = null;
let windowControls = { ...DEFAULT_WINDOW_CONTROLS };
let codexPluginConfig = { ...DEFAULT_CODEX_PLUGIN_CONFIG };
let codexRuntimePath = "";
let codexRuntimeState = null;
let codexRuntimeWatcher = null;
let codexRuntimePollTimer = null;
let codexRuntimeLastPayload = "";
let reminderPluginConfig = { ...DEFAULT_REMINDER_PLUGIN_CONFIG };
let reminderService = null;
let reminderRuntimeState = null;
let reminderRuntimeLastPayload = "";
let reminderPollTimer = null;
let taskPluginConfig = { ...DEFAULT_TASK_PLUGIN_CONFIG };
let taskService = null;
let taskNotification = null;
let taskNotificationLastPayload = "";
let taskPollTimer = null;
let manualRenderSelection = null;
let shortcutService = null;
let macInputService = null;
let macInputPermissionStatus = process.platform === "darwin" ? "unknown" : "denied";
let macInputDragPoint = null;
let macInputDragging = false;
let lastMouseHitCanInteract = false;
let mouseHitRegions = [];
let windowDragActive = false;
let windowIgnoringMouseEvents = null;
function resolveProjectPath(...segments) {
  return node_path.join(projectRoot, ...segments);
}
async function readJsonFile(...segments) {
  const raw = await promises.readFile(resolveProjectPath(...segments), "utf8");
  return JSON.parse(raw);
}
async function readJsonPath(path) {
  const raw = await promises.readFile(path, "utf8");
  return JSON.parse(raw);
}
function resolveProfilePath(path) {
  return node_path.isAbsolute(path) ? path : resolveProjectPath(path);
}
async function loadPetProfileConfig() {
  return readJsonFile("data", "config", "pet_profiles.config.json");
}
function defaultPetProfileId(config) {
  return config.defaultProfileId || "legacy_real";
}
function profileDefinition(config, profileId) {
  const profile = config.profiles[profileId] ?? config.profiles[defaultPetProfileId(config)];
  if (!profile) {
    throw new Error("No usable pet profile is configured.");
  }
  return profile;
}
function hasRenderableActionAssets(action) {
  return node_fs.existsSync(resolveProfilePath(action.webmPath)) && node_fs.existsSync(resolveProfilePath(action.fallbackPath));
}
function materializeRegistryAvailability(profile, registry) {
  if (profile.locked) {
    return registry;
  }
  const nextRegistry = structuredClone(registry);
  for (const action of Object.values(nextRegistry.actions)) {
    action.available = Boolean(action.runtime && hasRenderableActionAssets(action));
  }
  return nextRegistry;
}
async function readProfileJson(profile, key) {
  const value = profile[key];
  if (typeof value !== "string") {
    throw new Error(`Profile ${profile.id} is missing ${String(key)}.`);
  }
  return readJsonPath(resolveProfilePath(value));
}
function profileStatePath() {
  return node_path.join(electron.app.getPath("userData"), "pet-profile-state.json");
}
async function saveSelectedProfile() {
  const settingsPath = profileStatePath();
  await promises.mkdir(node_path.dirname(settingsPath), { recursive: true });
  await promises.writeFile(settingsPath, JSON.stringify({ profileId: activeProfileId }, null, 2) + "\n", "utf8");
}
async function loadSelectedProfile() {
  try {
    const payload = await readJsonPath(profileStatePath());
    if (typeof payload.profileId === "string") {
      activeProfileId = payload.profileId;
    }
  } catch {
    activeProfileId = "legacy_real";
  }
}
async function profileReady(profile) {
  for (const key of ["companionConfigPath", "statesConfigPath", "actionRegistryPath"]) {
    if (!node_fs.existsSync(resolveProfilePath(profile[key]))) {
      return false;
    }
  }
  try {
    const registry = await readProfileJson(profile, "actionRegistryPath");
    const requiredAction = registry.actions[profile.requiredAction];
    return Boolean(requiredAction && hasRenderableActionAssets(requiredAction));
  } catch {
    return false;
  }
}
async function summarizeProfile(profile) {
  const ready = await profileReady(profile);
  return {
    id: profile.id,
    label: profile.label,
    description: profile.description,
    selected: profile.id === activeProfileId,
    ready,
    reason: ready ? null : `等待 ${profile.requiredAction} 的 WebM 与 keyframe 到位`,
    assetRoot: profile.assetRoot,
    requiredAction: profile.requiredAction
  };
}
async function petProfileState() {
  const config = await loadPetProfileConfig();
  await activeProfileDefinition();
  const defaultProfileId = defaultPetProfileId(config);
  const profiles = await Promise.all(
    Object.values(config.profiles).map((profile) => summarizeProfile(profile))
  );
  return {
    activeProfileId,
    defaultProfileId,
    profiles
  };
}
async function activeProfileDefinition() {
  const config = await loadPetProfileConfig();
  const defaultProfileId = defaultPetProfileId(config);
  const requestedProfile = profileDefinition(config, activeProfileId);
  if (requestedProfile.id !== defaultProfileId && !await profileReady(requestedProfile)) {
    activeProfileId = defaultProfileId;
    await saveSelectedProfile();
  } else {
    activeProfileId = requestedProfile.id;
  }
  return profileDefinition(config, activeProfileId);
}
async function readActiveCompanionConfig() {
  const profile = await activeProfileDefinition();
  return readProfileJson(profile, "companionConfigPath");
}
async function readActiveStatesConfig() {
  const profile = await activeProfileDefinition();
  return readProfileJson(profile, "statesConfigPath");
}
async function readActiveActionRegistryConfig() {
  const profile = await activeProfileDefinition();
  const registry = await readProfileJson(profile, "actionRegistryPath");
  return materializeRegistryAvailability(profile, registry);
}
function sendToRendererWindows(channel, payload) {
  for (const window of [mainWindowRef, controlCenterWindowRef]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}
function expandHomePath(path) {
  if (path === "~") {
    return node_os.homedir();
  }
  if (path.startsWith("~/")) {
    return node_path.join(node_os.homedir(), path.slice(2));
  }
  return path;
}
function resolveRuntimePath(path) {
  const expandedPath = expandHomePath(path);
  return node_path.isAbsolute(expandedPath) ? expandedPath : node_path.resolve(projectRoot, expandedPath);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function timestampMs(value) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
function registerConfigHandlers() {
  electron.ipcMain.handle("config:get-companion", () => readActiveCompanionConfig());
  electron.ipcMain.handle("config:get-states", () => readActiveStatesConfig());
  electron.ipcMain.handle("config:get-action-registry", () => readActiveActionRegistryConfig());
}
function publishPetProfileState(state) {
  sendToRendererWindows(PET_PROFILE_CHANGED_CHANNEL, state);
}
function registerPetProfileHandlers() {
  electron.ipcMain.handle("pet-profile:list", () => petProfileState());
  electron.ipcMain.handle("pet-profile:set", async (_event, profileId) => {
    if (typeof profileId !== "string") {
      throw new Error("Invalid pet profile id.");
    }
    const config = await loadPetProfileConfig();
    const profile = config.profiles[profileId];
    if (!profile) {
      throw new Error(`Unknown pet profile: ${profileId}`);
    }
    if (profile.id !== defaultPetProfileId(config) && !await profileReady(profile)) {
      throw new Error(profile.description ? `${profile.label} 素材未就绪。` : "Pet profile is not ready.");
    }
    activeProfileId = profile.id;
    activeCompanionConfig = await readActiveCompanionConfig();
    manualRenderSelection = null;
    await saveSelectedProfile();
    publishManualRenderSelection();
    const state = await petProfileState();
    publishPetProfileState(state);
    return state;
  });
}
async function loadCodexPluginConfig() {
  try {
    const pluginsConfig = await readJsonFile("data", "config", "plugins.config.json");
    return {
      ...DEFAULT_CODEX_PLUGIN_CONFIG,
      ...pluginsConfig.plugins.codex_plugin
    };
  } catch (error) {
    console.warn("Failed to load codex plugin config; using defaults.", error);
    return { ...DEFAULT_CODEX_PLUGIN_CONFIG };
  }
}
async function loadReminderPluginConfig() {
  try {
    const pluginsConfig = await readJsonFile("data", "config", "plugins.config.json");
    const reminderConfig = pluginsConfig.plugins.reminder_plugin ?? {};
    return {
      ...DEFAULT_REMINDER_PLUGIN_CONFIG,
      ...reminderConfig,
      quickCreateMinutes: reminderConfig.quickCreateMinutes ?? DEFAULT_REMINDER_PLUGIN_CONFIG.quickCreateMinutes
    };
  } catch (error) {
    console.warn("Failed to load reminder plugin config; using defaults.", error);
    return { ...DEFAULT_REMINDER_PLUGIN_CONFIG };
  }
}
async function loadTaskPluginConfig() {
  try {
    const pluginsConfig = await readJsonFile("data", "config", "plugins.config.json");
    return {
      ...DEFAULT_TASK_PLUGIN_CONFIG,
      ...pluginsConfig.plugins.task_plugin
    };
  } catch (error) {
    console.warn("Failed to load task plugin config; using defaults.", error);
    return { ...DEFAULT_TASK_PLUGIN_CONFIG };
  }
}
function clampScale(scale, companionConfig) {
  const { defaultScale, minScale, maxScale } = companionConfig.renderer;
  if (!Number.isFinite(scale)) {
    return defaultScale;
  }
  return Number(Math.min(Math.max(scale, minScale), maxScale).toFixed(2));
}
function windowSizeForScale(scale) {
  return {
    width: Math.round(WINDOW_WIDTH * scale),
    height: Math.round(WINDOW_HEIGHT * scale)
  };
}
function setFixedWindowContentSize(mainWindow, scale) {
  const { width, height } = windowSizeForScale(scale);
  mainWindow.setMinimumSize(width, height);
  mainWindow.setMaximumSize(width, height);
  mainWindow.setContentSize(width, height);
}
function applyWindowScale(mainWindow, requestedScale) {
  if (!activeCompanionConfig) {
    return windowControls.scale;
  }
  const scale = clampScale(requestedScale, activeCompanionConfig);
  setFixedWindowContentSize(mainWindow, scale);
  windowControls = {
    ...windowControls,
    scale
  };
  return scale;
}
function setWindowMouseIgnore(mainWindow, ignore) {
  if (windowIgnoringMouseEvents === ignore) {
    return;
  }
  mainWindow.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : void 0);
  windowIgnoringMouseEvents = ignore;
}
function sanitizeMouseHitRegions(regions) {
  if (!Array.isArray(regions)) {
    return [];
  }
  const nextRegions = [];
  for (const region of regions.slice(0, MAX_MOUSE_HIT_REGIONS)) {
    if (!isRecord(region)) {
      continue;
    }
    const x = numberValue(region.x);
    const y = numberValue(region.y);
    const width = numberValue(region.width);
    const height = numberValue(region.height);
    if (x === void 0 || y === void 0 || width === void 0 || height === void 0) {
      continue;
    }
    const normalizedWidth = Math.round(width);
    const normalizedHeight = Math.round(height);
    if (normalizedWidth <= 0 || normalizedHeight <= 0) {
      continue;
    }
    nextRegions.push({
      x: Math.round(x),
      y: Math.round(y),
      width: normalizedWidth,
      height: normalizedHeight
    });
  }
  return nextRegions;
}
function setMouseHitRegions(regions) {
  mouseHitRegions = sanitizeMouseHitRegions(regions);
  syncMacInputHitRegions();
}
function pointInMouseHitRegions(x, y) {
  return mouseHitRegions.some(
    (region) => x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height
  );
}
function syncMacInputHitRegions() {
  const mainWindow = mainWindowRef;
  if (!mainWindow || mainWindow.isDestroyed()) {
    macInputService?.syncHitRegions(null, []);
    return;
  }
  macInputService?.syncHitRegions(mainWindow.getContentBounds(), mouseHitRegions);
}
function applyMouseHitTest(mainWindow, canInteract) {
  lastMouseHitCanInteract = canInteract;
  if (windowControls.mouseMode === "interactive" || windowDragActive) {
    setWindowMouseIgnore(mainWindow, false);
    return canInteract;
  }
  setWindowMouseIgnore(mainWindow, !canInteract);
  return canInteract;
}
function applyMouseMode(mainWindow, mode) {
  windowControls = {
    ...windowControls,
    mouseMode: mode,
    mousePassthrough: mode === "smart"
  };
  applyMouseHitTest(mainWindow, mode === "interactive" ? true : lastMouseHitCanInteract);
  pollMouseHitTest();
  return windowControls;
}
function applyMousePassthrough(mainWindow, enabled) {
  return applyMouseMode(mainWindow, enabled ? "smart" : "interactive").mousePassthrough;
}
function pollMouseHitTest() {
  const mainWindow = mainWindowRef;
  if (!mainWindow || mainWindow.isDestroyed() || windowControls.mouseMode !== "smart") {
    return;
  }
  const cursor = electron.screen.getCursorScreenPoint();
  const bounds = mainWindow.getContentBounds();
  const inside = cursor.x >= bounds.x && cursor.x <= bounds.x + bounds.width && cursor.y >= bounds.y && cursor.y <= bounds.y + bounds.height;
  if (!inside) {
    applyMouseHitTest(mainWindow, false);
    return;
  }
  const localX = cursor.x - bounds.x;
  const localY = cursor.y - bounds.y;
  if (mouseHitRegions.length > 0) {
    applyMouseHitTest(mainWindow, pointInMouseHitRegions(localX, localY));
    return;
  }
  mainWindow.webContents.send(MOUSE_HIT_TEST_SAMPLE_CHANNEL, {
    x: localX,
    y: localY
  });
}
function registerWindowControlHandlers() {
  electron.ipcMain.handle("window:get-controls", () => windowControls);
  electron.ipcMain.handle("window:set-scale", (_event, requestedScale) => {
    if (!mainWindowRef || typeof requestedScale !== "number") {
      return windowControls.scale;
    }
    return applyWindowScale(mainWindowRef, requestedScale);
  });
  electron.ipcMain.handle("window:set-mouse-passthrough", (_event, enabled) => {
    if (!mainWindowRef || typeof enabled !== "boolean") {
      return windowControls.mousePassthrough;
    }
    return applyMousePassthrough(mainWindowRef, enabled);
  });
  electron.ipcMain.handle("window:set-mouse-mode", (_event, mode) => {
    if (!mainWindowRef || mode !== "smart" && mode !== "interactive") {
      return windowControls;
    }
    return applyMouseMode(mainWindowRef, mode);
  });
  electron.ipcMain.handle("window:set-mouse-hit-test", (_event, canInteract) => {
    if (!mainWindowRef || typeof canInteract !== "boolean") {
      return lastMouseHitCanInteract;
    }
    return applyMouseHitTest(mainWindowRef, canInteract);
  });
  electron.ipcMain.handle("window:set-mouse-hit-regions", (_event, regions) => {
    setMouseHitRegions(regions);
  });
  electron.ipcMain.handle("window:set-drag-active", (_event, active) => {
    if (!mainWindowRef || typeof active !== "boolean") {
      return;
    }
    windowDragActive = active;
    if (active) {
      setWindowMouseIgnore(mainWindowRef, false);
    } else {
      pollMouseHitTest();
    }
  });
  electron.ipcMain.handle("window:move-by", (_event, deltaX, deltaY) => {
    if (!mainWindowRef) {
      return;
    }
    const safeDeltaX = numberValue(deltaX);
    const safeDeltaY = numberValue(deltaY);
    if (safeDeltaX === void 0 || safeDeltaY === void 0) {
      return;
    }
    const [currentX, currentY] = mainWindowRef.getPosition();
    mainWindowRef.setPosition(currentX + Math.round(safeDeltaX), currentY + Math.round(safeDeltaY), false);
    syncMacInputHitRegions();
  });
}
function isManualRenderSelection(value) {
  return isRecord(value) && typeof value.state === "string" && COMPANION_STATES.has(value.state) && (value.variant === null || typeof value.variant === "string") && (value.folder === void 0 || value.folder === null || typeof value.folder === "string") && (value.replayId === void 0 || typeof value.replayId === "number");
}
function publishManualRenderSelection() {
  sendToRendererWindows(MANUAL_RENDER_SELECTION_CHANNEL, manualRenderSelection);
}
function publishInteractionDragActive(active) {
  sendToRendererWindows(INTERACTION_DRAG_ACTIVE_CHANNEL, active);
}
function registerManualRenderHandlers() {
  electron.ipcMain.handle("render:get-manual-selection", () => manualRenderSelection);
  electron.ipcMain.handle("render:set-manual-selection", (_event, selection) => {
    if (!isManualRenderSelection(selection)) {
      throw new Error("Invalid render selection.");
    }
    manualRenderSelection = {
      state: selection.state,
      variant: selection.variant,
      folder: selection.folder ?? selection.variant ?? null,
      replayId: selection.replayId
    };
    publishManualRenderSelection();
    return manualRenderSelection;
  });
}
function publishShortcutsUpdated() {
  sendToRendererWindows(SHORTCUTS_UPDATED_CHANNEL, shortcutService?.list() ?? []);
}
function publishInputPermissionStatus(status) {
  macInputPermissionStatus = status;
  sendToRendererWindows(INPUT_PERMISSION_STATUS_CHANNEL, status);
}
function controlCenterModuleFromUnknown(value) {
  return value === "tasks" || value === "reminders" || value === "settings" || value === "status" ? value : "status";
}
function controlCenterUrl(module) {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}?window=control-center&module=${module}` : node_url.pathToFileURL(node_path.join(__dirname, "../renderer/index.html")).toString() + `?window=control-center&module=${module}`;
}
function fitControlCenterBounds(anchor) {
  const display = electron.screen.getDisplayNearestPoint(anchor);
  const workArea = display.workArea;
  const margin = 12;
  const x = Math.min(Math.max(anchor.x + margin, workArea.x + margin), workArea.x + workArea.width - CONTROL_CENTER_WIDTH - margin);
  const y = Math.min(Math.max(anchor.y + margin, workArea.y + margin), workArea.y + workArea.height - CONTROL_CENTER_HEIGHT - margin);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: CONTROL_CENTER_WIDTH,
    height: CONTROL_CENTER_HEIGHT
  };
}
async function createControlCenterWindow(module) {
  const controlCenterWindow = new electron.BrowserWindow({
    width: CONTROL_CENTER_WIDTH,
    height: CONTROL_CENTER_HEIGHT,
    minWidth: CONTROL_CENTER_WIDTH,
    minHeight: CONTROL_CENTER_HEIGHT,
    maxWidth: CONTROL_CENTER_WIDTH,
    maxHeight: CONTROL_CENTER_HEIGHT,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#fbf7f0",
    hasShadow: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "Desktop AI Companion Control Center",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  controlCenterWindowRef = controlCenterWindow;
  controlCenterWindow.setFullScreenable(false);
  controlCenterWindow.setAlwaysOnTop(true, "floating");
  controlCenterWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      closeControlCenterWindow();
    }
  });
  controlCenterWindow.on("blur", () => {
    closeControlCenterWindow();
  });
  controlCenterWindow.on("closed", () => {
    if (controlCenterWindowRef === controlCenterWindow) {
      controlCenterWindowRef = null;
    }
  });
  await controlCenterWindow.loadURL(controlCenterUrl(module));
  return controlCenterWindow;
}
async function openControlCenterWindow(module = "status", anchor = electron.screen.getCursorScreenPoint()) {
  let controlCenterWindow = controlCenterWindowRef;
  if (!controlCenterWindow || controlCenterWindow.isDestroyed()) {
    controlCenterWindow = await createControlCenterWindow(module);
  }
  controlCenterWindow.setBounds(fitControlCenterBounds(anchor), false);
  controlCenterWindow.webContents.send(CONTROL_CENTER_MODULE_CHANNEL, module);
  controlCenterWindow.show();
  controlCenterWindow.focus();
}
function closeControlCenterWindow() {
  const controlCenterWindow = controlCenterWindowRef;
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
    controlCenterWindow.hide();
  }
}
async function toggleControlCenterWindow(module = "status") {
  const controlCenterWindow = controlCenterWindowRef;
  if (controlCenterWindow && !controlCenterWindow.isDestroyed() && controlCenterWindow.isVisible()) {
    closeControlCenterWindow();
    return;
  }
  await openControlCenterWindow(module);
}
function shortcutActions() {
  return new Map([
    [
      "control-center.toggle",
      () => {
        toggleControlCenterWindow("status").catch((error) => {
          console.warn("Failed to toggle control center.", error);
        });
      }
    ],
    ...["control-center.status", "control-center.reminders", "control-center.tasks", "control-center.settings"].map(
      (id) => [
        id,
        () => {
          const module = moduleForShortcutId(id) ?? "status";
          openControlCenterWindow(module).catch((error) => {
            console.warn("Failed to open control center.", error);
          });
        }
      ]
    )
  ]);
}
function registerShortcuts() {
  shortcutService?.register(shortcutActions());
}
async function reloadShortcutsAfterUpdate(shortcuts) {
  shortcutService?.unregister();
  registerShortcuts();
  macInputService?.updateModifier(shortcutService?.interactionModifier() ?? "Option");
  publishShortcutsUpdated();
  return shortcuts;
}
function registerShortcutHandlers() {
  electron.ipcMain.handle("shortcuts:list", () => shortcutService?.list() ?? []);
  electron.ipcMain.handle("shortcuts:update", async (_event, id, accelerator) => {
    if (!shortcutService || typeof id !== "string" || typeof accelerator !== "string") {
      throw new Error("Invalid shortcut update.");
    }
    return reloadShortcutsAfterUpdate(await shortcutService.updateShortcut(id, accelerator));
  });
  electron.ipcMain.handle("shortcuts:reset", async (_event, id) => {
    if (!shortcutService || typeof id !== "string") {
      throw new Error("Invalid shortcut reset.");
    }
    return reloadShortcutsAfterUpdate(await shortcutService.resetShortcut(id));
  });
  electron.ipcMain.handle("input-permission:get-status", () => macInputPermissionStatus);
  electron.ipcMain.handle("input-permission:open-settings", async () => {
    await electron.shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  });
  electron.ipcMain.handle("control-center:open", async (_event, module) => {
    await openControlCenterWindow(controlCenterModuleFromUnknown(module));
  });
  electron.ipcMain.handle("control-center:close", () => {
    closeControlCenterWindow();
  });
}
function handleMacInputEvent(event) {
  const mainWindow = mainWindowRef;
  if (!mainWindow || mainWindow.isDestroyed() || typeof event.x !== "number" || typeof event.y !== "number") {
    return;
  }
  if (event.type === "leftDown") {
    macInputDragPoint = { x: event.x, y: event.y };
    macInputDragging = false;
    return;
  }
  if (event.type === "leftDragged" && macInputDragPoint) {
    if (!macInputDragging) {
      macInputDragging = true;
      publishInteractionDragActive(true);
    }
    const deltaX = event.x - macInputDragPoint.x;
    const deltaY = event.y - macInputDragPoint.y;
    const [currentX, currentY] = mainWindow.getPosition();
    mainWindow.setPosition(currentX + Math.round(deltaX), currentY + Math.round(deltaY), false);
    macInputDragPoint = { x: event.x, y: event.y };
    syncMacInputHitRegions();
    return;
  }
  if (event.type === "leftUp") {
    macInputDragPoint = null;
    if (macInputDragging) {
      macInputDragging = false;
      publishInteractionDragActive(false);
    }
    return;
  }
  if (event.type === "rightDown") {
    openControlCenterWindow("status", { x: Math.round(event.x), y: Math.round(event.y) }).catch((error) => {
      console.warn("Failed to open control center from mouse shortcut.", error);
    });
  }
}
function startMacInputService() {
  macInputService = new MacInputService(
    resolveProjectPath("app", "electron", "macos-input-helper.swift"),
    handleMacInputEvent,
    publishInputPermissionStatus
  );
  macInputService.start(shortcutService?.interactionModifier() ?? "Option");
}
function parseCodexRuntimeState(raw) {
  if (!isRecord(raw)) {
    return null;
  }
  const state = stringValue(raw.state);
  const timestamp = stringValue(raw.timestamp);
  if (raw.source !== "codex" || !state || !CODEX_RUNTIME_STATES.has(state) || !timestamp) {
    return null;
  }
  const exitCode = numberValue(raw.exitCode);
  return {
    source: "codex",
    state,
    message: stringValue(raw.message),
    task: stringValue(raw.task),
    event: stringValue(raw.event),
    cwd: stringValue(raw.cwd),
    toolName: stringValue(raw.toolName),
    exitCode: exitCode === void 0 ? void 0 : exitCode,
    timestamp,
    expiresAt: stringValue(raw.expiresAt)
  };
}
function idleCodexRenderState(raw, isStale) {
  return {
    source: "codex",
    state: "idle",
    message: null,
    task: raw?.task ?? null,
    event: raw?.event ?? null,
    cwd: raw?.cwd ?? null,
    toolName: raw?.toolName ?? null,
    exitCode: raw?.exitCode ?? null,
    timestamp: raw?.timestamp ?? null,
    isStale
  };
}
function normalizeCodexRuntimeState(raw, now = Date.now()) {
  const expiresAtMs = timestampMs(raw.expiresAt);
  if (expiresAtMs !== null && expiresAtMs <= now) {
    return idleCodexRenderState(raw, true);
  }
  const rawTimestampMs = timestampMs(raw.timestamp);
  if (raw.state === "success" && rawTimestampMs !== null && !raw.expiresAt && rawTimestampMs + codexPluginConfig.successHoldMs <= now) {
    return idleCodexRenderState(raw, true);
  }
  if (raw.state === "error" && rawTimestampMs !== null && !raw.expiresAt && rawTimestampMs + codexPluginConfig.errorHoldMs <= now) {
    return idleCodexRenderState(raw, true);
  }
  const state = raw.state === "coding" && rawTimestampMs !== null && rawTimestampMs + codexPluginConfig.thinkingTimeoutMs <= now ? "thinking" : raw.state;
  return {
    source: "codex",
    state,
    message: raw.message ?? null,
    task: raw.task ?? null,
    event: raw.event ?? null,
    cwd: raw.cwd ?? null,
    toolName: raw.toolName ?? null,
    exitCode: raw.exitCode ?? null,
    timestamp: raw.timestamp,
    isStale: false
  };
}
function publishCodexRuntimeState(nextState) {
  const payload = JSON.stringify(nextState);
  if (payload === codexRuntimeLastPayload) {
    return;
  }
  codexRuntimeState = nextState;
  codexRuntimeLastPayload = payload;
  sendToRendererWindows(CODEX_RUNTIME_STATE_CHANNEL, nextState);
  syncTaskFromCodexState(nextState);
}
async function readAndPublishCodexRuntimeState() {
  if (!codexPluginConfig.enabled || !codexRuntimePath) {
    publishCodexRuntimeState(null);
    return;
  }
  try {
    const raw = await promises.readFile(codexRuntimePath, "utf8");
    const parsed = parseCodexRuntimeState(JSON.parse(raw));
    if (!parsed) {
      console.warn(`Invalid Codex runtime state ignored: ${codexRuntimePath}`);
      return;
    }
    publishCodexRuntimeState(normalizeCodexRuntimeState(parsed));
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      publishCodexRuntimeState(null);
      return;
    }
    console.warn(`Failed to read Codex runtime state: ${codexRuntimePath}`, error);
  }
}
function registerCodexRuntimeHandlers() {
  electron.ipcMain.handle("codex:get-runtime-state", () => codexRuntimeState);
}
async function startCodexRuntimeService() {
  codexPluginConfig = await loadCodexPluginConfig();
  codexRuntimePath = resolveRuntimePath(codexPluginConfig.runtimeStatePath);
  if (!codexPluginConfig.enabled) {
    publishCodexRuntimeState(null);
    return;
  }
  const runtimeDirectory = node_path.dirname(codexRuntimePath);
  await promises.mkdir(runtimeDirectory, { recursive: true });
  await readAndPublishCodexRuntimeState();
  codexRuntimeWatcher?.close();
  codexRuntimeWatcher = node_fs.watch(runtimeDirectory, { persistent: false }, () => {
    readAndPublishCodexRuntimeState().catch((error) => {
      console.warn("Failed to refresh Codex runtime state after fs event.", error);
    });
  });
  if (codexRuntimePollTimer) {
    clearInterval(codexRuntimePollTimer);
  }
  codexRuntimePollTimer = setInterval(() => {
    readAndPublishCodexRuntimeState().catch((error) => {
      console.warn("Failed to poll Codex runtime state.", error);
    });
  }, Math.max(250, codexPluginConfig.pollIntervalMs));
  codexRuntimePollTimer.unref();
}
function publishReminderRuntimeState(nextState) {
  const payload = JSON.stringify(nextState);
  if (payload === reminderRuntimeLastPayload) {
    return;
  }
  reminderRuntimeState = nextState;
  reminderRuntimeLastPayload = payload;
  sendToRendererWindows(REMINDER_RUNTIME_STATE_CHANNEL, nextState);
}
function publishRemindersUpdated() {
  const reminders = reminderService?.listReminders() ?? [];
  sendToRendererWindows(REMINDERS_UPDATED_CHANNEL, reminders);
}
function currentReminderService() {
  if (!reminderService) {
    throw new Error("Reminder service is not ready.");
  }
  return reminderService;
}
function numberId(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
function reminderInputFromUnknown(value) {
  if (!isRecord(value)) {
    throw new Error("Reminder input is invalid.");
  }
  const title = stringValue(value.title);
  const dueAt = stringValue(value.dueAt);
  if (!title || !dueAt) {
    throw new Error("Reminder title and dueAt are required.");
  }
  return {
    title,
    dueAt,
    repeatRule: stringValue(value.repeatRule),
    priority: stringValue(value.priority)
  };
}
function registerReminderHandlers() {
  electron.ipcMain.handle("reminders:get-runtime-state", () => reminderRuntimeState);
  electron.ipcMain.handle("reminders:list", () => reminderService?.listReminders() ?? []);
  electron.ipcMain.handle("reminders:create", (_event, input) => {
    const reminder = currentReminderService().createReminder(reminderInputFromUnknown(input));
    publishRemindersUpdated();
    return reminder;
  });
  electron.ipcMain.handle("reminders:dismiss", (_event, idValue) => {
    const id = numberId(idValue);
    if (!id) {
      return null;
    }
    const reminder = currentReminderService().dismissReminder(id);
    if (reminderRuntimeState?.reminder.id === id) {
      publishReminderRuntimeState(null);
    }
    publishRemindersUpdated();
    return reminder;
  });
  electron.ipcMain.handle("reminders:dismiss-notification", (_event, idValue) => {
    const id = numberId(idValue);
    if (!id) {
      return null;
    }
    const reminder = currentReminderService().dismissNotification(id);
    if (reminderRuntimeState?.reminder.id === id) {
      publishReminderRuntimeState(null);
    }
    publishRemindersUpdated();
    return reminder;
  });
  electron.ipcMain.handle("reminders:snooze", (_event, idValue, minutesValue) => {
    const id = numberId(idValue);
    const minutes = typeof minutesValue === "number" && Number.isFinite(minutesValue) ? minutesValue : null;
    if (!id || minutes === null) {
      return null;
    }
    const reminder = currentReminderService().snoozeReminder(id, minutes);
    if (reminderRuntimeState?.reminder.id === id) {
      publishReminderRuntimeState(null);
    }
    publishRemindersUpdated();
    return reminder;
  });
}
function pollDueReminders() {
  if (reminderRuntimeState || !reminderService?.enabled) {
    return;
  }
  const notification = reminderService.consumeDueReminder();
  if (!notification) {
    return;
  }
  publishReminderRuntimeState(notification);
  publishRemindersUpdated();
}
async function startReminderService() {
  reminderPluginConfig = await loadReminderPluginConfig();
  reminderService?.close();
  reminderService = new ReminderService(reminderPluginConfig, projectRoot);
  reminderService.init();
  if (reminderPollTimer) {
    clearInterval(reminderPollTimer);
  }
  if (!reminderService.enabled) {
    publishReminderRuntimeState(null);
    publishRemindersUpdated();
    return;
  }
  pollDueReminders();
  reminderPollTimer = setInterval(pollDueReminders, reminderService.pollIntervalMs);
  reminderPollTimer.unref();
}
function createQuickReminderFromMenu(minutes) {
  const reminder = reminderService?.createQuickReminder(minutes);
  if (!reminder) {
    return;
  }
  publishRemindersUpdated();
}
function registerReminderContextMenu(mainWindow) {
  mainWindow.webContents.on("context-menu", () => {
    if (!reminderService?.enabled && !taskService?.enabled) {
      return;
    }
    const template = [];
    if (reminderService?.enabled) {
      template.push(
        ...reminderService.quickCreateMinutes.map((minutes) => ({
          label: `${minutes} 分钟后提醒`,
          click: () => createQuickReminderFromMenu(minutes)
        })),
        { type: "separator" },
        {
          label: "提醒面板",
          click: () => {
            openControlCenterWindow("reminders").catch((error) => {
              console.warn("Failed to open reminders from menu.", error);
            });
          }
        }
      );
    }
    if (taskService?.enabled) {
      if (template.length > 0) {
        template.push({ type: "separator" });
      }
      template.push({
        label: "任务中心",
        click: () => {
          openControlCenterWindow("tasks").catch((error) => {
            console.warn("Failed to open tasks from menu.", error);
          });
        }
      });
    }
    electron.Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}
function publishTaskNotification(nextNotification) {
  const payload = JSON.stringify(nextNotification);
  if (payload === taskNotificationLastPayload) {
    return;
  }
  taskNotification = nextNotification;
  taskNotificationLastPayload = payload;
  sendToRendererWindows(TASK_NOTIFICATION_CHANNEL, nextNotification);
}
function taskSnapshot() {
  return taskService?.snapshot() ?? {
    today: [],
    currentCodex: null,
    recentCompleted: []
  };
}
function publishTasksUpdated() {
  const tasks = taskSnapshot();
  sendToRendererWindows(TASKS_UPDATED_CHANNEL, tasks);
}
function currentTaskService() {
  if (!taskService) {
    throw new Error("Task service is not ready.");
  }
  return taskService;
}
function taskInputFromUnknown(value) {
  if (!isRecord(value)) {
    throw new Error("Task input is invalid.");
  }
  const title = stringValue(value.title);
  if (!title) {
    throw new Error("Task title is required.");
  }
  return {
    title,
    taskDate: stringValue(value.taskDate)
  };
}
function taskStatusFromUnknown(value) {
  return value === "todo" || value === "active" || value === "blocked" || value === "done" || value === "failed" ? value : null;
}
function registerTaskHandlers() {
  electron.ipcMain.handle("tasks:list", () => taskSnapshot());
  electron.ipcMain.handle("tasks:get-notification", () => taskNotification);
  electron.ipcMain.handle("tasks:create", (_event, input) => {
    const task = currentTaskService().createTask(taskInputFromUnknown(input));
    publishTasksUpdated();
    return task;
  });
  electron.ipcMain.handle("tasks:update-status", (_event, idValue, statusValue) => {
    const id = numberId(idValue);
    const status = taskStatusFromUnknown(statusValue);
    if (!id || !status) {
      return null;
    }
    const task = currentTaskService().updateTaskStatus(id, status);
    if (taskNotification?.task.id === id && status !== "blocked") {
      publishTaskNotification(null);
    }
    publishTasksUpdated();
    return task;
  });
  electron.ipcMain.handle("tasks:delete", (_event, idValue) => {
    const id = numberId(idValue);
    if (!id) {
      return false;
    }
    const deleted = currentTaskService().deleteTask(id);
    if (taskNotification?.task.id === id) {
      publishTaskNotification(null);
    }
    publishTasksUpdated();
    return deleted;
  });
  electron.ipcMain.handle("tasks:dismiss-notification", (_event, idValue) => {
    const id = numberId(idValue);
    if (!id) {
      return null;
    }
    const task = currentTaskService().dismissTaskNotification(id);
    if (taskNotification?.task.id === id) {
      publishTaskNotification(null);
    }
    publishTasksUpdated();
    return task;
  });
}
function syncTaskFromCodexState(nextState) {
  const task = taskService?.handleCodexState(nextState) ?? null;
  if (!task) {
    return;
  }
  if (taskNotification?.task.id === task.id && task.status !== "blocked") {
    publishTaskNotification(null);
  }
  publishTasksUpdated();
}
function pollStuckTasks() {
  if (taskNotification || !taskService?.enabled) {
    return;
  }
  const notification = taskService.consumeStuckNotification();
  if (!notification) {
    return;
  }
  publishTaskNotification(notification);
  publishTasksUpdated();
}
async function startTaskService() {
  taskPluginConfig = await loadTaskPluginConfig();
  taskService?.close();
  taskService = new TaskService(taskPluginConfig, projectRoot);
  taskService.init();
  if (taskPollTimer) {
    clearInterval(taskPollTimer);
  }
  if (!taskService.enabled) {
    publishTaskNotification(null);
    publishTasksUpdated();
    return;
  }
  pollStuckTasks();
  taskPollTimer = setInterval(pollStuckTasks, taskService.pollIntervalMs);
  taskPollTimer.unref();
}
function registerAssetProtocol() {
  electron.protocol.handle(ASSET_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    const rawRelativePath = decodeURIComponent(`${requestUrl.hostname}${requestUrl.pathname}`);
    const relativePath = node_path.normalize(rawRelativePath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^(\/|\\)+/, "");
    const absolutePath = node_path.resolve(projectRoot, relativePath);
    const pathFromRoot = node_path.relative(projectRoot, absolutePath);
    if (pathFromRoot.startsWith("..") || node_path.isAbsolute(pathFromRoot)) {
      return new Response("Invalid asset path", { status: 400 });
    }
    if (!node_fs.existsSync(absolutePath)) {
      console.warn(`Asset not found: ${relativePath} -> ${absolutePath}`);
      return new Response("Asset not found", { status: 404 });
    }
    return electron.net.fetch(node_url.pathToFileURL(absolutePath).toString());
  });
}
function companionCommandFromInput(input) {
  if (input.type !== "keyDown") {
    return null;
  }
  switch (input.key) {
    case "ArrowRight":
      return "next-state";
    case "ArrowLeft":
      return "previous-state";
    case "Escape":
      return "reset-idle";
    case "+":
    case "=":
      return "scale-up";
    case "-":
    case "_":
      return "scale-down";
    case "0":
      return "scale-reset";
    default:
      return null;
  }
}
function sendCompanionCommand(mainWindow, command) {
  mainWindow.webContents.send(COMPANION_COMMAND_CHANNEL, command);
}
function registerKeyboardCommands(mainWindow) {
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const command = companionCommandFromInput(input);
    if (!command) {
      return;
    }
    event.preventDefault();
    sendCompanionCommand(mainWindow, command);
  });
}
async function createMainWindow() {
  const companionConfig = await readActiveCompanionConfig();
  activeCompanionConfig = companionConfig;
  windowControls = {
    ...DEFAULT_WINDOW_CONTROLS,
    scale: clampScale(companionConfig.renderer.defaultScale, companionConfig)
  };
  mouseHitRegions = [];
  lastMouseHitCanInteract = false;
  windowDragActive = false;
  windowIgnoringMouseEvents = null;
  const initialWindowSize = windowSizeForScale(windowControls.scale);
  const mainWindow = new electron.BrowserWindow({
    width: initialWindowSize.width,
    height: initialWindowSize.height,
    minWidth: initialWindowSize.width,
    minHeight: initialWindowSize.height,
    maxWidth: initialWindowSize.width,
    maxHeight: initialWindowSize.height,
    resizable: false,
    frame: false,
    transparent: companionConfig.window.transparent,
    backgroundColor: "#00000000",
    hasShadow: false,
    show: false,
    focusable: false,
    alwaysOnTop: companionConfig.window.alwaysOnTop,
    title: "Desktop AI Companion",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindowRef = mainWindow;
  electron.Menu.setApplicationMenu(null);
  mainWindow.setFullScreenable(false);
  mainWindow.setAlwaysOnTop(companionConfig.window.alwaysOnTop, "floating");
  setWindowMouseIgnore(mainWindow, true);
  mainWindow.once("ready-to-show", () => {
    mainWindow.showInactive();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    setWindowMouseIgnore(mainWindow, true);
    syncMacInputHitRegions();
  });
  registerKeyboardCommands(mainWindow);
  registerReminderContextMenu(mainWindow);
  mainWindow.on("closed", () => {
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null;
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(node_path.join(__dirname, "../renderer/index.html"));
  }
  return mainWindow;
}
electron.app.whenReady().then(async () => {
  await loadSelectedProfile();
  registerConfigHandlers();
  registerPetProfileHandlers();
  registerWindowControlHandlers();
  registerManualRenderHandlers();
  registerShortcutHandlers();
  registerCodexRuntimeHandlers();
  registerReminderHandlers();
  registerTaskHandlers();
  registerAssetProtocol();
  shortcutService = new ShortcutService();
  await shortcutService.load();
  await startTaskService();
  await startCodexRuntimeService();
  await startReminderService();
  await createMainWindow();
  registerShortcuts();
  startMacInputService();
  syncMacInputHitRegions();
  electron.app.on("activate", async () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
      syncMacInputHitRegions();
    }
  });
});
electron.app.on("will-quit", () => {
  shortcutService?.unregister();
  macInputService?.stop();
  codexRuntimeWatcher?.close();
  if (codexRuntimePollTimer) {
    clearInterval(codexRuntimePollTimer);
  }
  if (reminderPollTimer) {
    clearInterval(reminderPollTimer);
  }
  reminderService?.close();
  if (taskPollTimer) {
    clearInterval(taskPollTimer);
  }
  taskService?.close();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
