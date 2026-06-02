"use strict";
const electron = require("electron");
const node_fs = require("node:fs");
const promises = require("node:fs/promises");
const node_child_process = require("node:child_process");
const node_net = require("node:net");
const node_crypto = require("node:crypto");
const node_os = require("node:os");
const node_path = require("node:path");
const node_url = require("node:url");
const node_util = require("node:util");
const node_sqlite = require("node:sqlite");
const COMPANION_PROTOCOL_VERSION = 1;
const COMPANION_PROTOCOL_METHODS = [
  "companion.status",
  "companion.react",
  "companion.say",
  "companion.agent.set_state",
  "companion.agent.get_state",
  "companion.agent.clear_state",
  "companion.confirm.request",
  "companion.confirm.get",
  "companion.confirm.cancel",
  "companion.context.summary",
  "companion.activity.list",
  "companion.permissions.summary",
  "companion.plugins.summary",
  "companion.profile.list",
  "companion.profile.capabilities",
  "companion.profile.select"
];
const AGENT_REACTION_TO_STATE = {
  idle: "idle",
  reset: "idle",
  thinking: "thinking",
  editing: "coding",
  coding: "coding",
  waiting: "reminder",
  success: "success",
  error: "error"
};
const AGENT_STATUS_TO_STATE = {
  idle: "idle",
  working: "coding",
  testing: "thinking",
  waiting_auth: "waiting_auth",
  blocked: "error",
  done: "success"
};
const SECRET_PATTERN = /(?:api[_-]?key|secret|token|password|passwd|bearer|sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})/i;
const URL_PATTERN$1 = /\b(?:https?:\/\/|www\.)\S+/i;
const ABSOLUTE_PATH_PATTERN$1 = /(?:^|\s)(?:~\/|\/(?:Users|private|var|tmp|etc|opt|home|Volumes)\b|[A-Za-z]:\\)/;
const STACK_PATTERN = /\b(?:at\s+\S+\s+\(|Traceback \(most recent call last\)|File ".+", line \d+)/;
const CODE_PATTERN = /```|;\s*(?:rm|git|npm|python|node|curl)\b|(?:function|const|let|var|class)\s+\w+/;
function mapAgentReaction(reaction) {
  const normalizedReaction = reaction.trim().toLowerCase();
  return AGENT_REACTION_TO_STATE[normalizedReaction] ?? null;
}
function mapAgentStatus(status) {
  const normalizedStatus = status.trim().toLowerCase();
  return AGENT_STATUS_TO_STATE[normalizedStatus] ?? null;
}
function normalizeAgentStatus(status) {
  const normalizedStatus = status.trim().toLowerCase();
  return AGENT_STATUS_TO_STATE[normalizedStatus] ? normalizedStatus : null;
}
function validateAgentMessage(value, options) {
  if (typeof value !== "string") {
    return { ok: false, error: "message must be a string" };
  }
  const message = value.trim().replace(/\s+/g, " ");
  if (!message) {
    return { ok: false, error: "message is empty" };
  }
  if (message.length > options.maxChars) {
    return { ok: false, error: `message exceeds ${options.maxChars} characters` };
  }
  if (value.split(/\r?\n/).length > 2) {
    return { ok: false, error: "message looks like multi-line output" };
  }
  if (URL_PATTERN$1.test(message)) {
    return { ok: false, error: "message contains a URL" };
  }
  if (ABSOLUTE_PATH_PATTERN$1.test(message)) {
    return { ok: false, error: "message contains a local path" };
  }
  if (SECRET_PATTERN.test(message)) {
    return { ok: false, error: "message may contain a secret" };
  }
  if (STACK_PATTERN.test(message)) {
    return { ok: false, error: "message looks like a stack trace" };
  }
  if (CODE_PATTERN.test(message)) {
    return { ok: false, error: "message looks like code or a shell command" };
  }
  return { ok: true, message };
}
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
const ABSOLUTE_PATH_PATTERN = /(?:^|\s)(?:~\/|\/(?:Users|private|var|tmp|etc|opt|home|Volumes)\b|[A-Za-z]:\\)/;
const BLOCKED_FIELD_PATTERN = /^(?:(?:script|shell|command|module|require|import|network|fetch|write|file|path|url)s?|(?:script|shell|command|module|network|fetch|write|file|path|url).*(?:path|url|file|command|script))$/i;
const ALLOWED_PERMISSIONS = /* @__PURE__ */ new Set(["display.speech", "display.reaction", "display.action"]);
const ALLOWED_REACTIONS = /* @__PURE__ */ new Set(["idle", "reset", "thinking", "editing", "coding", "waiting", "success", "error"]);
const MAX_RECENT_ERRORS = 12;
function isRecord$1(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertAllowedKeys(value, allowedKeys, label) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported field: ${key}`);
    }
  }
}
function assertSafeManifestValue(value, key = "manifest") {
  if (typeof value === "string") {
    if (URL_PATTERN.test(value)) {
      throw new Error(`${key} contains a URL`);
    }
    if (ABSOLUTE_PATH_PATTERN.test(value) || node_path.isAbsolute(value)) {
      throw new Error(`${key} contains an absolute path`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeManifestValue(item, `${key}[${index}]`));
    return;
  }
  if (!isRecord$1(value)) {
    return;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    if (BLOCKED_FIELD_PATTERN.test(childKey)) {
      throw new Error(`manifest contains blocked field: ${childKey}`);
    }
    assertSafeManifestValue(childValue, childKey);
  }
}
function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}
function requiredPositiveInteger(value, label) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}
function optionalTtl(value, config) {
  if (value === void 0) {
    return void 0;
  }
  const ttlMs = requiredPositiveInteger(value, "effect.ttlMs");
  if (ttlMs > config.maxTtlMs) {
    throw new Error(`effect.ttlMs exceeds ${config.maxTtlMs}`);
  }
  return ttlMs;
}
function validateReactionPool(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value.map((reaction) => {
    const normalized = requiredString(reaction, label).toLowerCase();
    if (!ALLOWED_REACTIONS.has(normalized)) {
      throw new Error(`${label} contains unknown reaction: ${normalized}`);
    }
    return normalized;
  });
}
function validateTrigger(value, config) {
  if (!isRecord$1(value)) {
    throw new Error("trigger must be an object");
  }
  if (value.type === "interval") {
    assertAllowedKeys(value, ["type", "intervalMs"], "interval trigger");
    const intervalMs = requiredPositiveInteger(value.intervalMs, "intervalMs");
    if (intervalMs < config.minIntervalMs) {
      throw new Error(`intervalMs must be at least ${config.minIntervalMs}`);
    }
    return { type: "interval", intervalMs };
  }
  if (value.type === "idle") {
    assertAllowedKeys(value, ["type", "idleMs", "repeatIntervalMs"], "idle trigger");
    const idleMs = requiredPositiveInteger(value.idleMs, "idleMs");
    if (idleMs < config.minIntervalMs) {
      throw new Error(`idleMs must be at least ${config.minIntervalMs}`);
    }
    const repeatIntervalMs = value.repeatIntervalMs === void 0 ? void 0 : requiredPositiveInteger(value.repeatIntervalMs, "repeatIntervalMs");
    if (repeatIntervalMs !== void 0 && repeatIntervalMs < config.minIntervalMs) {
      throw new Error(`repeatIntervalMs must be at least ${config.minIntervalMs}`);
    }
    return { type: "idle", idleMs, repeatIntervalMs };
  }
  if (value.type === "condition") {
    assertAllowedKeys(value, ["type", "source", "equals"], "condition trigger");
    if (value.source !== "agent.status" && value.source !== "codex.state") {
      throw new Error(`unsupported condition source: ${String(value.source)}`);
    }
    return {
      type: "condition",
      source: value.source,
      equals: requiredString(value.equals, "condition.equals")
    };
  }
  throw new Error(`unsupported trigger type: ${String(value.type)}`);
}
function validateEffect(value, config, validateMessage) {
  if (!isRecord$1(value)) {
    throw new Error("effect must be an object");
  }
  if (value.type === "speech_pool") {
    assertAllowedKeys(value, ["type", "messages", "reactions", "ttlMs"], "speech_pool effect");
    if (!Array.isArray(value.messages) || value.messages.length === 0) {
      throw new Error("speech_pool.messages must be a non-empty array");
    }
    const messages = value.messages.map((message) => {
      const validation = validateMessage(message);
      if (!validation.ok || !validation.message) {
        throw new Error(`speech_pool message rejected: ${validation.error ?? "invalid message"}`);
      }
      return validation.message;
    });
    return {
      type: "speech_pool",
      messages,
      reactions: value.reactions === void 0 ? void 0 : validateReactionPool(value.reactions, "speech_pool.reactions"),
      ttlMs: optionalTtl(value.ttlMs, config)
    };
  }
  if (value.type === "reaction_pool") {
    assertAllowedKeys(value, ["type", "reactions", "ttlMs"], "reaction_pool effect");
    return {
      type: "reaction_pool",
      reactions: validateReactionPool(value.reactions, "reaction_pool.reactions"),
      ttlMs: optionalTtl(value.ttlMs, config)
    };
  }
  if (value.type === "random_action") {
    assertAllowedKeys(value, ["type", "ttlMs"], "random_action effect");
    return { type: "random_action", ttlMs: optionalTtl(value.ttlMs, config) };
  }
  throw new Error(`unsupported effect type: ${String(value.type)}`);
}
function validateManifest(value, config, validateMessage) {
  if (!isRecord$1(value)) {
    throw new Error("manifest must be an object");
  }
  assertSafeManifestValue(value);
  assertAllowedKeys(
    value,
    [
      "schemaVersion",
      "id",
      "version",
      "label",
      "description",
      "enabledByDefault",
      "profileIds",
      "permissions",
      "cooldownMs",
      "triggers",
      "effects"
    ],
    "manifest"
  );
  if (value.schemaVersion !== 1) {
    throw new Error("schemaVersion must be 1");
  }
  const id = requiredString(value.id, "id");
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new Error(`invalid plugin id: ${id}`);
  }
  const version = requiredString(value.version, "version");
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`invalid plugin version: ${version}`);
  }
  if (typeof value.enabledByDefault !== "boolean") {
    throw new Error("enabledByDefault must be boolean");
  }
  if (!Array.isArray(value.permissions) || value.permissions.length === 0) {
    throw new Error("permissions must be a non-empty array");
  }
  const permissions = value.permissions.map((permission) => {
    const normalized = requiredString(permission, "permission");
    if (!ALLOWED_PERMISSIONS.has(normalized)) {
      throw new Error(`unsupported permission: ${normalized}`);
    }
    return normalized;
  });
  if (!Array.isArray(value.triggers) || value.triggers.length === 0) {
    throw new Error("triggers must be a non-empty array");
  }
  if (!Array.isArray(value.effects) || value.effects.length === 0) {
    throw new Error("effects must be a non-empty array");
  }
  const cooldownMs = value.cooldownMs === void 0 ? config.minCooldownMs : requiredPositiveInteger(value.cooldownMs, "cooldownMs");
  if (cooldownMs < config.minCooldownMs) {
    throw new Error(`cooldownMs must be at least ${config.minCooldownMs}`);
  }
  const profileIds = value.profileIds === void 0 ? void 0 : Array.isArray(value.profileIds) ? value.profileIds.map((profileId) => requiredString(profileId, "profileId")) : (() => {
    throw new Error("profileIds must be an array");
  })();
  return {
    schemaVersion: 1,
    id,
    version,
    label: requiredString(value.label, "label"),
    description: requiredString(value.description, "description"),
    enabledByDefault: value.enabledByDefault,
    profileIds,
    permissions,
    cooldownMs,
    triggers: value.triggers.map((trigger) => validateTrigger(trigger, config)),
    effects: value.effects.map((effect) => validateEffect(effect, config, validateMessage))
  };
}
function randomItem(values) {
  return values[Math.floor(Math.random() * values.length)] ?? null;
}
function safeRelativeDirectory(path, label) {
  const normalized = node_path.normalize(path).replaceAll("\\", "/");
  if (!path || node_path.isAbsolute(path) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${label} must be a relative directory`);
  }
  return normalized;
}
function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : "plugin error";
  return message.replace(/(?:~\/|\/(?:Users|private|var|tmp|etc|opt|home|Volumes)\/[^\s:]*)/g, "[redacted-path]").replace(/\btoken\b/gi, "value").replace(/\b(?:socketPath|discoveryPath)\b/g, "[redacted-field]").slice(0, 180);
}
class DeclarativePluginService {
  constructor(options) {
    this.options = options;
    this.builtinDirectory = node_path.resolve(
      options.projectRoot,
      safeRelativeDirectory(options.config.builtinDirectory, "builtinDirectory")
    );
    this.localDirectory = node_path.resolve(
      options.userDataPath,
      safeRelativeDirectory(options.config.localDirectory, "localDirectory")
    );
    this.toggleStatePath = node_path.resolve(
      options.userDataPath,
      safeRelativeDirectory(options.config.toggleStateFile, "toggleStateFile")
    );
  }
  options;
  builtinDirectory;
  localDirectory;
  toggleStatePath;
  plugins = /* @__PURE__ */ new Map();
  recentErrors = [];
  conditionValues = /* @__PURE__ */ new Map();
  overrides = {};
  timer = null;
  lastBusyAt = Date.now();
  feedbackSequence = 0;
  async start() {
    await promises.mkdir(this.localDirectory, { recursive: true });
    await this.loadOverrides();
    await this.refresh();
    if (!this.options.config.enabled) {
      return;
    }
    this.timer = setInterval(() => {
      this.tick().catch((error) => this.recordError("builtin", "scheduler", error));
    }, Math.max(250, this.options.config.schedulerIntervalMs));
    this.timer.unref();
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  async refresh() {
    this.plugins.clear();
    this.recentErrors.length = 0;
    const builtinIds = await this.loadDirectory(this.builtinDirectory, "builtin");
    await this.loadDirectory(this.localDirectory, "local", builtinIds);
    const summary = this.summary();
    this.options.onSummaryChanged(summary);
    return summary;
  }
  async setEnabled(pluginId, enabled) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`unknown plugin: ${pluginId}`);
    }
    plugin.enabled = enabled;
    this.overrides[pluginId] = enabled;
    await promises.mkdir(node_path.dirname(this.toggleStatePath), { recursive: true });
    await promises.writeFile(this.toggleStatePath, `${JSON.stringify({ version: 1, overrides: this.overrides }, null, 2)}
`, "utf8");
    const summary = this.summary();
    this.options.onSummaryChanged(summary);
    return summary;
  }
  summary() {
    const plugins = [...this.plugins.values()].map((plugin) => ({
      id: plugin.manifest.id,
      version: plugin.manifest.version,
      label: plugin.manifest.label,
      description: plugin.manifest.description,
      source: plugin.source,
      permissions: [...plugin.manifest.permissions],
      profileIds: [...plugin.manifest.profileIds ?? []],
      enabledByDefault: plugin.manifest.enabledByDefault,
      enabled: plugin.enabled,
      lastTriggeredAt: plugin.lastTriggeredAt,
      lastError: plugin.lastError
    })).sort((left, right) => left.id.localeCompare(right.id));
    return {
      enabled: this.options.config.enabled,
      pluginCount: plugins.length,
      enabledCount: plugins.filter((plugin) => plugin.enabled).length,
      plugins,
      recentErrors: [...this.recentErrors]
    };
  }
  notifyCondition(source, value) {
    const previous = this.conditionValues.get(source);
    this.conditionValues.set(source, value);
    if (previous === value || !this.options.config.enabled) {
      return;
    }
    for (const plugin of this.plugins.values()) {
      plugin.manifest.triggers.forEach((trigger, index) => {
        if (trigger.type === "condition" && trigger.source === source && trigger.equals === value) {
          this.trigger(plugin, index, `condition:${source}:${value}`).catch((error) => {
            this.recordPluginError(plugin, error);
          });
        }
      });
    }
  }
  noteBusy() {
    this.lastBusyAt = Date.now();
  }
  async tick() {
    const context = await this.options.getRuntimeContext();
    const now = Date.now();
    if (context.blockReason) {
      this.lastBusyAt = now;
    }
    for (const plugin of this.plugins.values()) {
      plugin.manifest.triggers.forEach((trigger, index) => {
        const lastRunMs = plugin.triggerLastRunMs[index] ?? 0;
        if (trigger.type === "interval" && now - lastRunMs >= trigger.intervalMs) {
          this.trigger(plugin, index, "interval").catch((error) => this.recordPluginError(plugin, error));
        }
        if (trigger.type === "idle") {
          const repeatIntervalMs = trigger.repeatIntervalMs ?? trigger.idleMs;
          if (now - this.lastBusyAt >= trigger.idleMs && now - lastRunMs >= repeatIntervalMs) {
            this.trigger(plugin, index, "idle").catch((error) => this.recordPluginError(plugin, error));
          }
        }
      });
    }
  }
  async trigger(plugin, triggerIndex, trigger) {
    if (!plugin.enabled || !this.options.config.enabled) {
      return;
    }
    const now = Date.now();
    const cooldownMs = plugin.manifest.cooldownMs ?? this.options.config.minCooldownMs;
    if (now - plugin.lastTriggeredMs < cooldownMs) {
      return;
    }
    const context = await this.options.getRuntimeContext();
    if (plugin.manifest.profileIds && !plugin.manifest.profileIds.includes(context.activeProfileId)) {
      return;
    }
    if (context.blockReason) {
      plugin.triggerLastRunMs[triggerIndex] = now;
      this.options.onActivity("plugin_skip", `plugin skipped: ${plugin.manifest.id}`, {
        pluginId: plugin.manifest.id,
        reason: context.blockReason,
        trigger
      });
      return;
    }
    let message = null;
    let reaction = null;
    let action = null;
    let ttlMs = this.options.config.defaultTtlMs;
    for (const effect of plugin.manifest.effects) {
      ttlMs = Math.max(ttlMs, effect.ttlMs ?? this.options.config.defaultTtlMs);
      if (effect.type === "speech_pool") {
        message = randomItem(effect.messages);
        reaction = effect.reactions ? randomItem(effect.reactions) : reaction;
      } else if (effect.type === "reaction_pool") {
        reaction = randomItem(effect.reactions);
      } else if (effect.type === "random_action") {
        action = randomItem(context.readyActions);
      }
    }
    ttlMs = Math.min(ttlMs, this.options.config.maxTtlMs);
    if (!message && !reaction && !action) {
      throw new Error("plugin produced no runtime-ready feedback");
    }
    this.feedbackSequence += 1;
    plugin.lastTriggeredMs = now;
    plugin.lastTriggeredAt = new Date(now).toISOString();
    plugin.lastError = null;
    plugin.triggerLastRunMs[triggerIndex] = now;
    const feedback = {
      id: `plugin-${now}-${this.feedbackSequence}`,
      pluginId: plugin.manifest.id,
      message,
      reaction,
      action,
      expiresAt: new Date(now + ttlMs).toISOString()
    };
    this.options.onActivity("plugin_trigger", `plugin triggered: ${plugin.manifest.id}`, {
      pluginId: plugin.manifest.id,
      trigger,
      ttlMs
    });
    this.options.onFeedback(feedback);
    this.options.onSummaryChanged(this.summary());
  }
  async loadOverrides() {
    try {
      const value = JSON.parse(await promises.readFile(this.toggleStatePath, "utf8"));
      this.overrides = isRecord$1(value) && isRecord$1(value.overrides) ? Object.fromEntries(Object.entries(value.overrides).filter((entry) => typeof entry[1] === "boolean")) : {};
    } catch {
      this.overrides = {};
    }
  }
  async loadDirectory(directory, source, reservedIds = /* @__PURE__ */ new Set()) {
    const ids = new Set(reservedIds);
    let entries;
    try {
      entries = await promises.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (source === "local") {
        return ids;
      }
      this.recordError(source, node_path.basename(directory), error);
      return ids;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".plugin.json")) {
        continue;
      }
      if (this.plugins.size >= this.options.config.maxPlugins) {
        this.recordError(source, entry.name, new Error(`plugin limit exceeded: ${this.options.config.maxPlugins}`));
        continue;
      }
      try {
        const value = JSON.parse(await promises.readFile(node_path.join(directory, entry.name), "utf8"));
        const manifest = validateManifest(value, this.options.config, this.options.validateMessage);
        if (ids.has(manifest.id)) {
          throw new Error(`duplicate plugin id rejected: ${manifest.id}`);
        }
        ids.add(manifest.id);
        const loadedAt = Date.now();
        this.plugins.set(manifest.id, {
          manifest,
          source,
          enabled: this.overrides[manifest.id] ?? manifest.enabledByDefault,
          lastTriggeredAt: null,
          lastTriggeredMs: 0,
          lastError: null,
          triggerLastRunMs: manifest.triggers.map((trigger) => trigger.type === "interval" ? loadedAt : 0)
        });
      } catch (error) {
        this.recordError(source, entry.name, error);
      }
    }
    return ids;
  }
  recordPluginError(plugin, error) {
    const message = safeErrorMessage(error);
    plugin.lastError = message;
    this.options.onActivity("plugin_error", `plugin error: ${plugin.manifest.id}`, {
      pluginId: plugin.manifest.id,
      reason: message
    });
    this.options.onSummaryChanged(this.summary());
  }
  recordError(source, file, error) {
    const message = safeErrorMessage(error);
    this.recentErrors.push({ source, file: node_path.basename(file), message });
    while (this.recentErrors.length > MAX_RECENT_ERRORS) {
      this.recentErrors.shift();
    }
    this.options.onActivity("plugin_error", `plugin load error: ${node_path.basename(file)}`, {
      source,
      file: node_path.basename(file),
      reason: message
    });
  }
}
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
  clickCaptureEnabled = false;
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
    this.send({ type: "config", modifier: this.modifier, clickCaptureEnabled: this.clickCaptureEnabled });
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
  setClickCaptureEnabled(enabled) {
    this.clickCaptureEnabled = enabled;
    this.send({ type: "config", clickCaptureEnabled: enabled });
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
function nowIso$2() {
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
    const createdAt = nowIso$2();
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
    const updatedAt = nowIso$2();
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
    const updatedAt = nowIso$2();
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
    const triggeredAt = nowIso$2();
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
function nowIso$1() {
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
    const createdAt = nowIso$1();
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
    const updatedAt = nowIso$1();
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
    const notifiedAt = nowIso$1();
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
    const updatedAt = nowIso$1();
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
    const updatedAt = nowIso$1();
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
const AGENT_RUNTIME_STATE_CHANNEL = "agent:runtime-state";
const AGENT_CONFIRMATION_CHANNEL = "agent:confirmation";
const COMPANION_PROTOCOL_STATUS_CHANNEL = "companion-protocol:status";
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
const INTERACTION_CLICK_CHANNEL = "interaction:click";
const INTERACTION_DRAG_ACTIVE_CHANNEL = "interaction:drag-active";
const DECLARATIVE_PLUGIN_FEEDBACK_CHANNEL = "plugin:feedback";
const DECLARATIVE_PLUGINS_UPDATED_CHANNEL = "plugin:updated";
const MAX_MOUSE_HIT_REGIONS = 2400;
const CONTROL_CENTER_WIDTH = 420;
const CONTROL_CENTER_HEIGHT = 560;
const CONFIRMATION_DEFAULT_TTL_MS = 6e4;
const CONFIRMATION_MAX_TTL_MS = 3e5;
const CONFIRMATION_FEEDBACK_TTL_MS = 3e3;
const ACTIVITY_BUFFER_LIMIT = 50;
const ACTIVITY_DEFAULT_LIMIT = 20;
const DEFAULT_PERMISSION_POLICY_CONFIG = {
  version: 1,
  enabled: true,
  rules: {
    "companion.status": {
      method: "companion.status",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "Read app, profile, protocol, agent, confirmation and Codex status."
    },
    "companion.react": {
      method: "companion.react",
      group: "display",
      allowed: true,
      requiresConfirmation: false,
      description: "Trigger a short safe reaction on the companion."
    },
    "companion.say": {
      method: "companion.say",
      group: "display",
      allowed: true,
      requiresConfirmation: false,
      description: "Show a short validated companion message."
    },
    "companion.agent.set_state": {
      method: "companion.agent.set_state",
      group: "agent_state",
      allowed: true,
      requiresConfirmation: false,
      description: "Set the semantic agent state shown by the companion."
    },
    "companion.agent.get_state": {
      method: "companion.agent.get_state",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "Read the current semantic agent state."
    },
    "companion.agent.clear_state": {
      method: "companion.agent.clear_state",
      group: "agent_state",
      allowed: true,
      requiresConfirmation: false,
      description: "Clear the current semantic agent state."
    },
    "companion.confirm.request": {
      method: "companion.confirm.request",
      group: "confirmation",
      allowed: true,
      requiresConfirmation: false,
      description: "Request a local user confirmation through the control center temporary UI."
    },
    "companion.confirm.get": {
      method: "companion.confirm.get",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "Read the current or latest confirmation state."
    },
    "companion.confirm.cancel": {
      method: "companion.confirm.cancel",
      group: "confirmation",
      allowed: true,
      requiresConfirmation: false,
      description: "Cancel a pending confirmation request."
    },
    "companion.context.summary": {
      method: "companion.context.summary",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "Read a safe companion context summary."
    },
    "companion.activity.list": {
      method: "companion.activity.list",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "Read recent in-memory companion activity."
    },
    "companion.permissions.summary": {
      method: "companion.permissions.summary",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "Read the current companion permission policy summary."
    },
    "companion.plugins.summary": {
      method: "companion.plugins.summary",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "Read the safe declarative plugin runtime summary."
    },
    "companion.profile.list": {
      method: "companion.profile.list",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "List available pet profiles and readiness."
    },
    "companion.profile.capabilities": {
      method: "companion.profile.capabilities",
      group: "readonly",
      allowed: true,
      requiresConfirmation: false,
      description: "Read a safe profile capability manifest."
    },
    "companion.profile.select": {
      method: "companion.profile.select",
      group: "profile_change",
      allowed: true,
      requiresConfirmation: false,
      description: "Select a ready local pet profile."
    }
  }
};
const V12_BLOCKED_INTERACTION_ACTIONS = [];
const V12_COMPLETED_INTERACTION_ACTIONS = [
  "mouse_hover_look",
  "mouse_shy_loop",
  "mouse_leave_back",
  "click_head_happy",
  "click_body_confused",
  "drag_start_lift",
  "drag_hold_lift",
  "drag_end_dizzy"
];
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
  waitingAuthTimeoutMs: 6e4,
  successHoldMs: 4e3,
  errorHoldMs: 8e3
};
const DEFAULT_COMPANION_PROTOCOL_CONFIG = {
  enabled: true,
  discoveryPath: "~/.desktop-ai-companion/discovery/companion.json",
  socketPath: "~/.desktop-ai-companion/ipc/companion.sock",
  messageMaxChars: 80,
  cooldownMs: 1500,
  defaultTtlMs: 6e3,
  maxTtlMs: 15e3
};
const DEFAULT_DECLARATIVE_PLUGINS_CONFIG = {
  enabled: true,
  builtinDirectory: "data/plugins",
  localDirectory: "plugins",
  toggleStateFile: "plugin-overrides.json",
  maxPlugins: 64,
  schedulerIntervalMs: 1e3,
  minIntervalMs: 6e4,
  minCooldownMs: 15e3,
  defaultTtlMs: 6e3,
  maxTtlMs: 15e3
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
const execFileAsync = node_util.promisify(node_child_process.execFile);
const INSTALLED_ASSET_PREFIX = "__installed_profiles__";
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
let companionProtocolConfig = { ...DEFAULT_COMPANION_PROTOCOL_CONFIG };
let permissionPolicyConfig = structuredClone(DEFAULT_PERMISSION_POLICY_CONFIG);
let companionProtocolServer = null;
let companionProtocolToken = "";
let companionProtocolSocketPath = "";
let companionProtocolDiscoveryPath = "";
let companionProtocolLastError = null;
let agentRuntimeState = null;
let agentRuntimeTimer = null;
let agentRuntimeLastPayload = "";
let lastAgentMutationAt = 0;
let agentConfirmation = null;
let agentConfirmationTimer = null;
let companionActivitySequence = 0;
const companionActivities = [];
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
let declarativePluginsConfig = { ...DEFAULT_DECLARATIVE_PLUGINS_CONFIG };
let declarativePluginService = null;
let manualRenderSelection = null;
let shortcutService = null;
let macInputService = null;
let macInputPermissionStatus = process.platform === "darwin" ? "unknown" : "denied";
let macInputDragPoint = null;
let macInputDragging = false;
let lastMouseHitCanInteract = false;
let mouseHitRegions = [];
let nativeClickCaptureEnabled = false;
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
function installedProfilesRoot() {
  return node_path.join(electron.app.getPath("userData"), "profiles");
}
function safePackageRelativePath(path) {
  const normalizedPath = node_path.normalize(path).replaceAll("\\", "/");
  if (!path || node_path.isAbsolute(path) || normalizedPath === ".." || normalizedPath.startsWith("../")) {
    throw new Error(`Invalid package-relative path: ${path}`);
  }
  return normalizedPath.startsWith("./") ? normalizedPath.slice(2) : normalizedPath;
}
function resolveProfilePath(profile, path) {
  if (node_path.isAbsolute(path)) {
    return path;
  }
  if (!profile.packageRoot) {
    return resolveProjectPath(path);
  }
  const relativePath = safePackageRelativePath(path);
  const absolutePath = node_path.resolve(profile.packageRoot, relativePath);
  const pathFromRoot = node_path.relative(profile.packageRoot, absolutePath);
  if (pathFromRoot.startsWith("..") || node_path.isAbsolute(pathFromRoot)) {
    throw new Error(`Profile path escapes package root: ${path}`);
  }
  return absolutePath;
}
function installedAssetPath(profile, path) {
  return profile.packageRoot ? `${INSTALLED_ASSET_PREFIX}/${profile.id}/${safePackageRelativePath(path)}` : path;
}
async function readInstalledProfiles() {
  const root = installedProfilesRoot();
  try {
    const entries = await promises.readdir(root, { withFileTypes: true });
    const installedProfiles = {};
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      const packageRoot = node_path.join(root, entry.name);
      try {
        const manifest = await readJsonPath(node_path.join(packageRoot, "profile.package.json"));
        if (manifest.schemaVersion !== 1 || manifest.profileId !== entry.name) {
          throw new Error("package manifest id mismatch");
        }
        installedProfiles[manifest.profileId] = {
          id: manifest.profileId,
          label: manifest.label,
          description: manifest.description,
          companionConfigPath: safePackageRelativePath(manifest.entrypoints.companionConfig),
          statesConfigPath: safePackageRelativePath(manifest.entrypoints.statesConfig),
          actionRegistryPath: safePackageRelativePath(manifest.entrypoints.actionRegistry),
          interactionRulesPath: manifest.entrypoints.interactionRules ? safePackageRelativePath(manifest.entrypoints.interactionRules) : void 0,
          profileManifestPath: manifest.entrypoints.profileCapabilityManifest ? safePackageRelativePath(manifest.entrypoints.profileCapabilityManifest) : void 0,
          motionCatalogPath: safePackageRelativePath(manifest.entrypoints.motionCatalog),
          motionSourcesPath: safePackageRelativePath(manifest.entrypoints.motionSources),
          actionProgressPath: safePackageRelativePath(manifest.qaSummaryPath),
          qaRoot: "",
          assetRoot: safePackageRelativePath(manifest.assetsRoot),
          requiredAction: manifest.requiredAction,
          locked: false,
          packageRoot,
          packageManifestPath: "profile.package.json",
          profileVersion: manifest.profileVersion,
          source: "installed"
        };
      } catch (error) {
        console.warn(`Ignoring invalid installed profile: ${entry.name}`, error);
      }
    }
    return installedProfiles;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
async function loadPetProfileConfig() {
  const config = await readJsonFile("data", "config", "pet_profiles.config.json");
  const builtins = Object.fromEntries(
    Object.entries(config.profiles).map(([profileId, profile]) => [
      profileId,
      { ...profile, source: "builtin" }
    ])
  );
  const installed = await readInstalledProfiles();
  for (const profileId of Object.keys(builtins)) {
    delete installed[profileId];
  }
  return {
    ...config,
    profiles: {
      ...builtins,
      ...installed
    }
  };
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
function hasRenderableActionAssets(profile, action) {
  return node_fs.existsSync(resolveProfilePath(profile, action.webmPath)) && node_fs.existsSync(resolveProfilePath(profile, action.fallbackPath));
}
function materializeRegistryAvailability(profile, registry) {
  if (profile.locked) {
    return registry;
  }
  const nextRegistry = structuredClone(registry);
  for (const action of Object.values(nextRegistry.actions)) {
    action.available = Boolean(action.runtime && hasRenderableActionAssets(profile, action));
    if (profile.packageRoot) {
      action.path = installedAssetPath(profile, action.path);
      action.sourceDir = installedAssetPath(profile, action.sourceDir);
      action.webmPath = installedAssetPath(profile, action.webmPath);
      action.fallbackPath = installedAssetPath(profile, action.fallbackPath);
      action.sourceVideoPaths = action.sourceVideoPaths.map((path) => installedAssetPath(profile, path));
    }
  }
  nextRegistry.assetRoot = installedAssetPath(profile, nextRegistry.assetRoot);
  return nextRegistry;
}
async function readProfileJson(profile, key) {
  const value = profile[key];
  if (typeof value !== "string") {
    throw new Error(`Profile ${profile.id} is missing ${String(key)}.`);
  }
  return readJsonPath(resolveProfilePath(profile, value));
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
    if (!node_fs.existsSync(resolveProfilePath(profile, profile[key]))) {
      return false;
    }
  }
  try {
    const registry = await readProfileJson(profile, "actionRegistryPath");
    const requiredAction = registry.actions[profile.requiredAction];
    return Boolean(requiredAction && hasRenderableActionAssets(profile, requiredAction));
  } catch {
    return false;
  }
}
async function summarizeProfile(profile) {
  const ready = await profileReady(profile);
  let warnings = [];
  let profileVersion = profile.profileVersion ?? null;
  try {
    const manifest = await readProfilePackageManifest(profile);
    profileVersion = manifest.profileVersion;
    if (manifest.missingSourceActions.length > 0) {
      warnings.push(`${manifest.missingSourceActions.length} 个动作缺 source 视频`);
    }
    if (manifest.needsReplacementActions.length > 0) {
      warnings.push(`${manifest.needsReplacementActions.length} 个动作等待替换视频`);
    }
  } catch {
    warnings = [];
  }
  return {
    id: profile.id,
    label: profile.label,
    description: profile.description,
    selected: profile.id === activeProfileId,
    ready,
    reason: ready ? null : `等待 ${profile.requiredAction} 的 WebM 与 keyframe 到位`,
    assetRoot: profile.assetRoot,
    requiredAction: profile.requiredAction,
    source: profile.source ?? "builtin",
    profileVersion,
    warnings,
    removable: profile.source === "installed"
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
async function readActiveInteractionRulesConfig() {
  const profile = await activeProfileDefinition();
  const rulesPath = profile.interactionRulesPath ?? "data/config/interaction_rules.config.json";
  return readJsonPath(resolveProfilePath(profile, rulesPath));
}
async function readProfileCapabilityManifest(profile) {
  if (!profile.profileManifestPath) {
    return null;
  }
  return readJsonPath(resolveProfilePath(profile, profile.profileManifestPath));
}
async function readProfilePackageManifest(profile) {
  if (!profile.packageManifestPath) {
    throw new Error(`Profile ${profile.id} is missing packageManifestPath.`);
  }
  return readJsonPath(resolveProfilePath(profile, profile.packageManifestPath));
}
function fallbackProfileCapabilityManifest(profile, ready) {
  return {
    version: 1,
    profileId: profile.id,
    label: profile.label,
    stage: profile.locked ? "stable" : "in_progress",
    summary: profile.description,
    capabilities: {
      mcpLayers: ["L1_basic_remote_control"],
      states: {
        ready: ready ? [profile.requiredAction] : [],
        notReady: ready ? [] : [profile.requiredAction]
      },
      interactions: {
        ready: [],
        missingSource: [],
        blockedByVideo: []
      },
      confirmation: {
        currentEntry: "control_center_temp",
        futureEntry: "companion_bubble_pending_assets"
      }
    },
    assets: {
      runtimeReadyActions: ready ? [profile.requiredAction] : [],
      missingSourceActions: [],
      blockedByVideoActions: [],
      needsReplacementActions: [],
      videoLedgerPath: "docs/10_video_supply_progress.md",
      actionProgressPath: profile.actionProgressPath
    },
    distribution: {
      publishable: false,
      license: "TBD",
      provenance: "profile manifest fallback",
      notes: "No explicit profile manifest is configured."
    }
  };
}
function safeProfileCapabilitiesPayload(profile, summary, manifest) {
  return {
    profileId: profile.id,
    label: profile.label,
    description: profile.description,
    stage: manifest.stage,
    ready: summary.ready,
    reason: summary.reason,
    requiredAction: profile.requiredAction,
    capabilities: manifest.capabilities,
    assets: manifest.assets,
    distribution: manifest.distribution
  };
}
async function profileCapabilitiesPayload(params) {
  const config = await loadPetProfileConfig();
  const profileId = isRecord(params) && typeof params.profileId === "string" ? params.profileId.trim() : activeProfileId;
  const profile = config.profiles[profileId];
  if (!profile) {
    throw new Error(`unknown profileId: ${profileId}`);
  }
  const summary = await summarizeProfile(profile);
  const manifest = await readProfileCapabilityManifest(profile) ?? fallbackProfileCapabilityManifest(profile, summary.ready);
  return safeProfileCapabilitiesPayload(profile, summary, manifest);
}
async function profileCapabilitiesSummaryPayload(profileId) {
  const config = await loadPetProfileConfig();
  const profile = config.profiles[profileId];
  if (!profile) {
    return null;
  }
  const summary = await summarizeProfile(profile);
  const manifest = await readProfileCapabilityManifest(profile) ?? fallbackProfileCapabilityManifest(profile, summary.ready);
  return {
    profileId: profile.id,
    stage: manifest.stage,
    ready: summary.ready,
    mcpLayers: manifest.capabilities.mcpLayers,
    readyInteractions: manifest.capabilities.interactions.ready,
    missingSourceActions: manifest.assets.missingSourceActions,
    blockedByVideoActions: manifest.assets.blockedByVideoActions,
    needsReplacementActions: manifest.assets.needsReplacementActions,
    confirmationEntry: manifest.capabilities.confirmation.currentEntry,
    videoLedger: manifest.assets.videoLedgerPath
  };
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
function safeSummaryText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const validation = validateAgentMessage(value, { maxChars: companionProtocolConfig.messageMaxChars });
  return validation.ok ? validation.message ?? null : null;
}
function recordCompanionActivity(type, summary, details = {}) {
  companionActivitySequence += 1;
  companionActivities.push({
    id: companionActivitySequence,
    type,
    timestamp: nowIso(),
    summary,
    details
  });
  while (companionActivities.length > ACTIVITY_BUFFER_LIMIT) {
    companionActivities.shift();
  }
}
function activityLimitFromParams(params) {
  if (params === void 0 || params === null) {
    return ACTIVITY_DEFAULT_LIMIT;
  }
  if (!isRecord(params)) {
    throw new Error("params must be an object");
  }
  if (params.limit === void 0) {
    return ACTIVITY_DEFAULT_LIMIT;
  }
  const limit = numberValue(params.limit);
  if (limit === void 0 || !Number.isInteger(limit) || limit < 0 || limit > ACTIVITY_BUFFER_LIMIT) {
    throw new Error(`limit must be an integer between 0 and ${ACTIVITY_BUFFER_LIMIT}`);
  }
  return limit;
}
function declarativePluginSummaryPayload() {
  return declarativePluginService?.summary() ?? {
    enabled: declarativePluginsConfig.enabled,
    pluginCount: 0,
    enabledCount: 0,
    plugins: [],
    recentErrors: []
  };
}
function publishDeclarativePluginSummary(summary = declarativePluginSummaryPayload()) {
  sendToRendererWindows(DECLARATIVE_PLUGINS_UPDATED_CHANNEL, summary);
}
function declarativePluginBlockReason() {
  if (reminderRuntimeState && !reminderRuntimeState.isStale) {
    return "reminder_active";
  }
  if (taskNotification && !taskNotification.isStale) {
    return "task_active";
  }
  if (agentRuntimeState && !agentRuntimeState.isStale) {
    return "agent_active";
  }
  if (codexRuntimeState && codexRuntimeState.state !== "idle" && !codexRuntimeState.isStale) {
    return "codex_active";
  }
  if (windowDragActive) {
    return "user_drag_active";
  }
  return null;
}
async function declarativePluginRuntimeContext() {
  const registry = await readActiveActionRegistryConfig();
  return {
    activeProfileId,
    readyActions: registry.actionOrder.filter((actionId) => {
      const action = registry.actions[actionId];
      return Boolean(action?.runtime && action.available && action.type !== "fallback");
    }),
    blockReason: declarativePluginBlockReason()
  };
}
function publishDeclarativePluginFeedback(feedback) {
  const mainWindow = mainWindowRef;
  if (!mainWindow || mainWindow.isDestroyed()) {
    recordCompanionActivity("plugin_skip", `plugin skipped: ${feedback.pluginId}`, {
      pluginId: feedback.pluginId,
      reason: "renderer_unavailable"
    });
    return;
  }
  mainWindow.webContents.send(DECLARATIVE_PLUGIN_FEEDBACK_CHANNEL, feedback);
}
async function startDeclarativePluginService() {
  declarativePluginsConfig = await loadDeclarativePluginsConfig();
  declarativePluginService?.stop();
  declarativePluginService = new DeclarativePluginService({
    projectRoot,
    userDataPath: electron.app.getPath("userData"),
    config: declarativePluginsConfig,
    validateMessage: (message) => validateAgentMessage(message, { maxChars: companionProtocolConfig.messageMaxChars }),
    getRuntimeContext: declarativePluginRuntimeContext,
    onFeedback: publishDeclarativePluginFeedback,
    onActivity: recordCompanionActivity,
    onSummaryChanged: publishDeclarativePluginSummary
  });
  await declarativePluginService.start();
  publishDeclarativePluginSummary();
}
function isDeclarativePluginFeedbackResult(value) {
  return isRecord(value) && typeof value.feedbackId === "string" && typeof value.pluginId === "string" && (value.status === "accepted" || value.status === "skipped" || value.status === "interrupted") && (value.reason === null || typeof value.reason === "string");
}
function registerDeclarativePluginHandlers() {
  electron.ipcMain.handle("plugins:get-summary", () => declarativePluginSummaryPayload());
  electron.ipcMain.handle("plugins:set-enabled", async (_event, pluginId, enabled) => {
    if (typeof pluginId !== "string" || typeof enabled !== "boolean") {
      throw new Error("Invalid plugin toggle.");
    }
    if (!declarativePluginService) {
      throw new Error("Declarative plugin service is not ready.");
    }
    return declarativePluginService.setEnabled(pluginId, enabled);
  });
  electron.ipcMain.handle("plugins:refresh", async () => {
    if (!declarativePluginService) {
      throw new Error("Declarative plugin service is not ready.");
    }
    return declarativePluginService.refresh();
  });
  electron.ipcMain.on("plugins:feedback-result", (_event, result) => {
    if (!isDeclarativePluginFeedbackResult(result) || result.status === "accepted") {
      return;
    }
    recordCompanionActivity("plugin_skip", `plugin ${result.status}: ${result.pluginId}`, {
      pluginId: result.pluginId,
      feedbackId: result.feedbackId,
      reason: result.reason
    });
  });
}
function registerConfigHandlers() {
  electron.ipcMain.handle("config:get-companion", () => readActiveCompanionConfig());
  electron.ipcMain.handle("config:get-states", () => readActiveStatesConfig());
  electron.ipcMain.handle("config:get-action-registry", () => readActiveActionRegistryConfig());
  electron.ipcMain.handle("config:get-interaction-rules", () => readActiveInteractionRulesConfig());
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
    return selectPetProfile(profileId);
  });
  electron.ipcMain.handle("pet-profile:import", () => importPetProfile());
  electron.ipcMain.handle("pet-profile:remove", async (_event, profileId) => {
    if (typeof profileId !== "string") {
      throw new Error("Invalid pet profile id.");
    }
    return removePetProfile(profileId);
  });
}
async function runProfilePackageScript(args) {
  const scriptPath = resolveProjectPath("scripts", "profile_package.py");
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, ...args], {
      cwd: projectRoot,
      maxBuffer: 1024 * 1024
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (isRecord(error) && typeof error.stdout === "string") {
      try {
        const payload = JSON.parse(error.stdout);
        if (typeof payload.error === "string") {
          throw new Error(payload.error);
        }
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== error.stdout) {
          throw parseError;
        }
      }
    }
    throw error;
  }
}
async function importPetProfile() {
  const options = {
    title: "导入桌宠角色包",
    properties: ["openFile"],
    filters: [
      { name: "Desktop AI Companion Profile", extensions: ["zip"] }
    ]
  };
  const selection = controlCenterWindowRef ? await electron.dialog.showOpenDialog(controlCenterWindowRef, options) : await electron.dialog.showOpenDialog(options);
  if (selection.canceled || selection.filePaths.length === 0) {
    return petProfileState();
  }
  const builtinConfig = await readJsonFile("data", "config", "pet_profiles.config.json");
  const args = [
    "install",
    "--package",
    selection.filePaths[0],
    "--install-root",
    installedProfilesRoot()
  ];
  for (const profileId of Object.keys(builtinConfig.profiles)) {
    args.push("--reserved-profile", profileId);
  }
  const result = await runProfilePackageScript(args);
  const state = await petProfileState();
  publishPetProfileState(state);
  recordCompanionActivity("profile_import", `profile imported: ${String(result.profileId ?? "unknown")}`, {
    profileId: String(result.profileId ?? "unknown"),
    ready: true
  });
  return state;
}
async function removePetProfile(profileId) {
  const config = await loadPetProfileConfig();
  const profile = config.profiles[profileId];
  if (!profile) {
    throw new Error(`Unknown pet profile: ${profileId}`);
  }
  if (profile.source !== "installed" || !profile.packageRoot) {
    throw new Error("Built-in profiles cannot be removed.");
  }
  if (activeProfileId === profileId) {
    activeProfileId = defaultPetProfileId(config);
    activeCompanionConfig = await readActiveCompanionConfig();
    manualRenderSelection = null;
    await saveSelectedProfile();
    publishManualRenderSelection();
  }
  await promises.rm(profile.packageRoot, { recursive: true, force: true });
  const state = await petProfileState();
  publishPetProfileState(state);
  recordCompanionActivity("profile_remove", `profile removed: ${profileId}`, {
    profileId
  });
  return state;
}
async function selectPetProfile(profileId) {
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
  declarativePluginService?.noteBusy();
  await saveSelectedProfile();
  publishManualRenderSelection();
  const state = await petProfileState();
  publishPetProfileState(state);
  recordCompanionActivity("profile_select", `profile selected: ${profile.id}`, {
    profileId: profile.id,
    ready: true
  });
  return state;
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
async function loadCompanionProtocolConfig() {
  try {
    const pluginsConfig = await readJsonFile("data", "config", "plugins.config.json");
    return {
      ...DEFAULT_COMPANION_PROTOCOL_CONFIG,
      ...pluginsConfig.plugins.companion_protocol
    };
  } catch (error) {
    console.warn("Failed to load companion protocol config; using defaults.", error);
    return { ...DEFAULT_COMPANION_PROTOCOL_CONFIG };
  }
}
async function loadDeclarativePluginsConfig() {
  try {
    const pluginsConfig = await readJsonFile("data", "config", "plugins.config.json");
    return {
      ...DEFAULT_DECLARATIVE_PLUGINS_CONFIG,
      ...pluginsConfig.plugins.declarative_plugins
    };
  } catch (error) {
    console.warn("Failed to load declarative plugins config; using defaults.", error);
    return { ...DEFAULT_DECLARATIVE_PLUGINS_CONFIG };
  }
}
async function loadPermissionPolicyConfig() {
  try {
    const policy = await readJsonFile("data", "config", "permission_policy.config.json");
    return {
      ...DEFAULT_PERMISSION_POLICY_CONFIG,
      ...policy,
      rules: {
        ...DEFAULT_PERMISSION_POLICY_CONFIG.rules,
        ...policy.rules
      }
    };
  } catch (error) {
    console.warn("Failed to load permission policy config; using defaults.", error);
    return structuredClone(DEFAULT_PERMISSION_POLICY_CONFIG);
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
  electron.ipcMain.handle("window:set-native-click-capture", (_event, enabled) => {
    if (typeof enabled !== "boolean") {
      return;
    }
    nativeClickCaptureEnabled = enabled;
    macInputService?.setClickCaptureEnabled(enabled);
  });
  electron.ipcMain.handle("window:set-drag-active", (_event, active) => {
    if (!mainWindowRef || typeof active !== "boolean") {
      return;
    }
    windowDragActive = active;
    if (active) {
      declarativePluginService?.noteBusy();
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
function publishInteractionClick(x, y) {
  const mainWindow = mainWindowRef;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(INTERACTION_CLICK_CHANNEL, { x, y });
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
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function ttlFromUnknown(value) {
  const requestedTtl = numberValue(value);
  if (requestedTtl === void 0) {
    return companionProtocolConfig.defaultTtlMs;
  }
  return Math.min(Math.max(0, Math.round(requestedTtl)), companionProtocolConfig.maxTtlMs);
}
function confirmationTtlFromUnknown(value) {
  const requestedTtl = numberValue(value);
  if (requestedTtl === void 0) {
    return CONFIRMATION_DEFAULT_TTL_MS;
  }
  return Math.min(Math.max(1e3, Math.round(requestedTtl)), CONFIRMATION_MAX_TTL_MS);
}
function publishAgentRuntimeState(nextState) {
  const payload = JSON.stringify(nextState);
  if (payload === agentRuntimeLastPayload) {
    return;
  }
  agentRuntimeState = nextState;
  agentRuntimeLastPayload = payload;
  if (nextState) {
    declarativePluginService?.noteBusy();
  }
  declarativePluginService?.notifyCondition("agent.status", nextState?.status ?? "idle");
  sendToRendererWindows(AGENT_RUNTIME_STATE_CHANNEL, nextState);
  publishCompanionProtocolStatus();
}
function clearAgentRuntimeTimer() {
  if (agentRuntimeTimer) {
    clearTimeout(agentRuntimeTimer);
    agentRuntimeTimer = null;
  }
}
function setAgentRuntimeState(state, status, reaction, message, ttlMs) {
  clearAgentRuntimeTimer();
  if (state === "idle" || ttlMs === 0) {
    publishAgentRuntimeState(null);
    return null;
  }
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const nextState = {
    source: "agent",
    state,
    status,
    reaction,
    message,
    timestamp,
    expiresAt,
    isStale: false
  };
  publishAgentRuntimeState(nextState);
  agentRuntimeTimer = setTimeout(() => {
    publishAgentRuntimeState(null);
    agentRuntimeTimer = null;
  }, ttlMs);
  return nextState;
}
function publishAgentConfirmation() {
  sendToRendererWindows(AGENT_CONFIRMATION_CHANNEL, agentConfirmation);
  publishCompanionProtocolStatus();
}
function clearAgentConfirmationTimer() {
  if (agentConfirmationTimer) {
    clearTimeout(agentConfirmationTimer);
    agentConfirmationTimer = null;
  }
}
function completeAgentConfirmation(status, resolvedBy) {
  if (!agentConfirmation || agentConfirmation.status !== "pending") {
    throw new Error("no pending confirmation request");
  }
  clearAgentConfirmationTimer();
  agentConfirmation = {
    ...agentConfirmation,
    status,
    respondedAt: nowIso(),
    resolvedBy
  };
  recordCompanionActivity("confirmation_result", `confirmation ${status}`, {
    requestId: agentConfirmation.requestId,
    status,
    resolvedBy
  });
  publishAgentConfirmation();
  if (status === "allowed") {
    setAgentRuntimeState("success", "done", null, "已允许", CONFIRMATION_FEEDBACK_TTL_MS);
  } else if (status === "denied") {
    setAgentRuntimeState("error", "blocked", null, "已拒绝", CONFIRMATION_FEEDBACK_TTL_MS);
  } else {
    clearAgentRuntimeTimer();
    publishAgentRuntimeState(null);
  }
  return agentConfirmation;
}
function expireAgentConfirmation() {
  if (!agentConfirmation || agentConfirmation.status !== "pending") {
    return;
  }
  completeAgentConfirmation("expired", "timeout");
}
function createAgentConfirmation(params) {
  if (agentConfirmation?.status === "pending") {
    throw new Error("confirmation request already pending");
  }
  const titleValidation = validateAgentMessage(params.title, {
    maxChars: companionProtocolConfig.messageMaxChars
  });
  if (!titleValidation.ok) {
    throw new Error(titleValidation.error ?? "invalid title");
  }
  const messageValidation = validateAgentMessage(params.message, {
    maxChars: companionProtocolConfig.messageMaxChars
  });
  if (!messageValidation.ok) {
    throw new Error(messageValidation.error ?? "invalid message");
  }
  const ttlMs = confirmationTtlFromUnknown(params.ttlMs);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  agentConfirmation = {
    requestId: `confirm-${Date.now()}-${node_crypto.randomBytes(4).toString("hex")}`,
    status: "pending",
    title: titleValidation.message ?? "",
    message: messageValidation.message ?? "",
    createdAt,
    expiresAt,
    respondedAt: null,
    resolvedBy: null
  };
  recordCompanionActivity("confirmation_request", agentConfirmation.title, {
    requestId: agentConfirmation.requestId,
    status: agentConfirmation.status
  });
  publishAgentConfirmation();
  setAgentRuntimeState("waiting_auth", "waiting_auth", null, agentConfirmation.title, ttlMs);
  agentConfirmationTimer = setTimeout(expireAgentConfirmation, ttlMs);
  openControlCenterWindow("integrations").catch((error) => {
    console.warn("Failed to open control center for confirmation.", error);
  });
  return agentConfirmation;
}
function respondAgentConfirmation(requestId, action) {
  if (!agentConfirmation || agentConfirmation.status !== "pending") {
    throw new Error("no pending confirmation request");
  }
  if (agentConfirmation.requestId !== requestId) {
    throw new Error("confirmation request id mismatch");
  }
  if (action === "allow") {
    return completeAgentConfirmation("allowed", "user");
  }
  if (action === "deny") {
    return completeAgentConfirmation("denied", "user");
  }
  if (action === "cancel") {
    return completeAgentConfirmation("cancelled", "user");
  }
  throw new Error("unsupported confirmation action");
}
function assertAgentCooldown() {
  const elapsedMs = Date.now() - lastAgentMutationAt;
  if (elapsedMs < companionProtocolConfig.cooldownMs) {
    throw new Error(`cooldown active; retry in ${companionProtocolConfig.cooldownMs - elapsedMs}ms`);
  }
  lastAgentMutationAt = Date.now();
}
function permissionPolicySummaryPayload() {
  const groupCounts = {};
  const blockedMethods = [];
  const confirmationRequiredMethods = [];
  for (const method of COMPANION_PROTOCOL_METHODS) {
    const rule = permissionPolicyConfig.rules[method];
    if (!rule) {
      blockedMethods.push(method);
      continue;
    }
    groupCounts[rule.group] = (groupCounts[rule.group] ?? 0) + 1;
    if (!rule.allowed) {
      blockedMethods.push(method);
    }
    if (rule.requiresConfirmation) {
      confirmationRequiredMethods.push(method);
    }
  }
  return {
    enabled: permissionPolicyConfig.enabled,
    version: permissionPolicyConfig.version,
    groupCounts,
    blockedMethods,
    confirmationRequiredMethods
  };
}
function permissionPolicyPayload() {
  return {
    summary: permissionPolicySummaryPayload(),
    rules: COMPANION_PROTOCOL_METHODS.map((method) => {
      const rule = permissionPolicyConfig.rules[method];
      return {
        method,
        group: rule?.group ?? "readonly",
        allowed: Boolean(rule?.allowed),
        requiresConfirmation: Boolean(rule?.requiresConfirmation),
        description: rule?.description ?? "Missing permission policy rule."
      };
    })
  };
}
function assertCompanionProtocolPermission(method) {
  if (!permissionPolicyConfig.enabled) {
    return;
  }
  if (!COMPANION_PROTOCOL_METHODS.includes(method)) {
    throw new Error(`unknown method: ${method}`);
  }
  const rule = permissionPolicyConfig.rules[method];
  if (!rule) {
    throw new Error(`permission policy missing method: ${method}`);
  }
  if (!rule.allowed) {
    throw new Error(`permission denied: ${method}`);
  }
  if (rule.requiresConfirmation) {
    throw new Error(`permission requires confirmation: ${method}`);
  }
}
function companionProtocolStatus() {
  return {
    enabled: companionProtocolConfig.enabled,
    running: Boolean(companionProtocolServer),
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    transport: "unix-socket",
    socketPath: companionProtocolSocketPath || null,
    discoveryPath: companionProtocolDiscoveryPath || null,
    appVersion: electron.app.getVersion(),
    methods: [...COMPANION_PROTOCOL_METHODS],
    agentState: agentRuntimeState,
    confirmation: agentConfirmation,
    permissionPolicy: permissionPolicySummaryPayload(),
    lastError: companionProtocolLastError
  };
}
function publishCompanionProtocolStatus() {
  sendToRendererWindows(COMPANION_PROTOCOL_STATUS_CHANNEL, companionProtocolStatus());
}
async function protocolStatusPayload() {
  const profiles = await petProfileState();
  return {
    appVersion: electron.app.getVersion(),
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    transport: "unix-socket",
    activeProfileId,
    profiles,
    agentState: agentRuntimeState,
    confirmation: agentConfirmation,
    codexState: codexRuntimeState,
    methods: [...COMPANION_PROTOCOL_METHODS],
    permissionPolicy: permissionPolicySummaryPayload()
  };
}
function safeCodexSummary() {
  if (!codexRuntimeState) {
    return null;
  }
  return {
    source: codexRuntimeState.source,
    state: codexRuntimeState.state,
    message: safeSummaryText(codexRuntimeState.message),
    task: safeSummaryText(codexRuntimeState.task),
    event: safeSummaryText(codexRuntimeState.event),
    toolName: safeSummaryText(codexRuntimeState.toolName),
    exitCode: codexRuntimeState.exitCode,
    timestamp: codexRuntimeState.timestamp,
    isStale: codexRuntimeState.isStale
  };
}
function safeAgentSummary() {
  if (!agentRuntimeState) {
    return null;
  }
  return {
    source: agentRuntimeState.source,
    state: agentRuntimeState.state,
    status: agentRuntimeState.status,
    message: safeSummaryText(agentRuntimeState.message),
    reaction: agentRuntimeState.reaction,
    timestamp: agentRuntimeState.timestamp,
    expiresAt: agentRuntimeState.expiresAt,
    isStale: agentRuntimeState.isStale
  };
}
function safeConfirmationSummary() {
  if (!agentConfirmation) {
    return null;
  }
  return {
    requestId: agentConfirmation.requestId,
    status: agentConfirmation.status,
    title: safeSummaryText(agentConfirmation.title),
    createdAt: agentConfirmation.createdAt,
    expiresAt: agentConfirmation.expiresAt,
    respondedAt: agentConfirmation.respondedAt,
    resolvedBy: agentConfirmation.resolvedBy
  };
}
async function contextSummaryPayload() {
  const profiles = await petProfileState();
  const profileCapabilitiesSummary = await profileCapabilitiesSummaryPayload(profiles.activeProfileId);
  return {
    appVersion: electron.app.getVersion(),
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    activeProfileId: profiles.activeProfileId,
    defaultProfileId: profiles.defaultProfileId,
    profiles: profiles.profiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      selected: profile.selected,
      ready: profile.ready,
      reason: profile.reason,
      requiredAction: profile.requiredAction
    })),
    agentState: safeAgentSummary(),
    confirmation: safeConfirmationSummary(),
    codexState: safeCodexSummary(),
    methods: [...COMPANION_PROTOCOL_METHODS],
    profileCapabilitiesSummary,
    permissionPolicySummary: permissionPolicySummaryPayload(),
    pluginSummary: declarativePluginSummaryPayload(),
    videoSupply: {
      ledger: "docs/10_video_supply_progress.md",
      generatedDetail: "docs/generated/profiles/guofeng_ai/action_progress.md",
      v12BlockedProfile: "guofeng_ai",
      v12BlockedActions: [...V12_BLOCKED_INTERACTION_ACTIONS],
      completedInteractionActions: [...V12_COMPLETED_INTERACTION_ACTIONS]
    }
  };
}
function activityListPayload(params) {
  const limit = activityLimitFromParams(params);
  return {
    activities: limit === 0 ? [] : companionActivities.slice(-limit)
  };
}
async function handleCompanionProtocolMethod(method, params) {
  if (method === "companion.status") {
    return protocolStatusPayload();
  }
  if (method === "companion.react") {
    if (!isRecord(params)) {
      throw new Error("params must be an object");
    }
    const reaction = stringValue(params.reaction);
    if (!reaction) {
      throw new Error("reaction is required");
    }
    const state = mapAgentReaction(reaction);
    if (!state) {
      throw new Error(`unsupported reaction: ${reaction}`);
    }
    assertAgentCooldown();
    const nextState = setAgentRuntimeState(state, null, reaction.trim().toLowerCase(), null, ttlFromUnknown(params.ttlMs));
    recordCompanionActivity("react", `reaction: ${reaction.trim().toLowerCase()}`, {
      reaction: reaction.trim().toLowerCase(),
      state
    });
    return { state, reaction: reaction.trim().toLowerCase(), agentState: nextState };
  }
  if (method === "companion.say") {
    if (!isRecord(params)) {
      throw new Error("params must be an object");
    }
    const validation = validateAgentMessage(params.message, {
      maxChars: companionProtocolConfig.messageMaxChars
    });
    if (!validation.ok) {
      throw new Error(validation.error ?? "invalid message");
    }
    let reaction = null;
    let state = "reminder";
    if (params.reaction !== void 0) {
      reaction = stringValue(params.reaction) ?? null;
      if (!reaction) {
        throw new Error("reaction must be a string");
      }
      const mappedState = mapAgentReaction(reaction);
      if (!mappedState) {
        throw new Error(`unsupported reaction: ${reaction}`);
      }
      state = mappedState;
    }
    assertAgentCooldown();
    const nextState = setAgentRuntimeState(
      state,
      null,
      reaction ? reaction.trim().toLowerCase() : null,
      validation.message ?? null,
      ttlFromUnknown(params.ttlMs)
    );
    recordCompanionActivity("say", validation.message ?? "message shown", {
      state,
      reaction: reaction ? reaction.trim().toLowerCase() : null
    });
    return { state, message: validation.message, agentState: nextState };
  }
  if (method === "companion.agent.set_state") {
    if (!isRecord(params)) {
      throw new Error("params must be an object");
    }
    const status = stringValue(params.status);
    if (!status) {
      throw new Error("status is required");
    }
    const normalizedStatus = normalizeAgentStatus(status);
    const state = mapAgentStatus(status);
    if (!normalizedStatus || !state) {
      throw new Error(`unsupported agent status: ${status}`);
    }
    let message = null;
    if (params.message !== void 0) {
      const validation = validateAgentMessage(params.message, {
        maxChars: companionProtocolConfig.messageMaxChars
      });
      if (!validation.ok) {
        throw new Error(validation.error ?? "invalid message");
      }
      message = validation.message ?? null;
    }
    if (state === "idle") {
      clearAgentRuntimeTimer();
      publishAgentRuntimeState(null);
      recordCompanionActivity("agent_clear", "agent state cleared", {
        status: normalizedStatus
      });
      return { status: normalizedStatus, state, agentState: null };
    }
    assertAgentCooldown();
    const nextState = setAgentRuntimeState(state, normalizedStatus, null, message, ttlFromUnknown(params.ttlMs));
    recordCompanionActivity("agent_state", `agent ${normalizedStatus}`, {
      status: normalizedStatus,
      state
    });
    return { status: normalizedStatus, state, message, agentState: nextState };
  }
  if (method === "companion.agent.get_state") {
    return { agentState: agentRuntimeState };
  }
  if (method === "companion.agent.clear_state") {
    clearAgentRuntimeTimer();
    publishAgentRuntimeState(null);
    recordCompanionActivity("agent_clear", "agent state cleared", {
      status: null
    });
    return { agentState: null };
  }
  if (method === "companion.confirm.request") {
    if (!isRecord(params)) {
      throw new Error("params must be an object");
    }
    return createAgentConfirmation(params);
  }
  if (method === "companion.confirm.get") {
    return { confirmation: agentConfirmation };
  }
  if (method === "companion.confirm.cancel") {
    return completeAgentConfirmation("cancelled", "agent");
  }
  if (method === "companion.context.summary") {
    return contextSummaryPayload();
  }
  if (method === "companion.activity.list") {
    return activityListPayload(params);
  }
  if (method === "companion.permissions.summary") {
    return permissionPolicyPayload();
  }
  if (method === "companion.plugins.summary") {
    return declarativePluginSummaryPayload();
  }
  if (method === "companion.profile.list") {
    return petProfileState();
  }
  if (method === "companion.profile.capabilities") {
    return profileCapabilitiesPayload(params);
  }
  if (method === "companion.profile.select") {
    if (!isRecord(params)) {
      throw new Error("params must be an object");
    }
    const profileId = stringValue(params.profileId);
    if (!profileId) {
      throw new Error("profileId is required");
    }
    return selectPetProfile(profileId);
  }
  throw new Error(`unknown method: ${method}`);
}
function protocolResponse(id, ok, payload) {
  return `${JSON.stringify(ok ? { id, ok, result: payload } : { id, ok, error: payload })}
`;
}
async function handleProtocolRequest(rawLine, socket) {
  let request;
  try {
    request = JSON.parse(rawLine);
  } catch {
    recordCompanionActivity("protocol_error", "invalid JSON", {
      method: null
    });
    socket.write(protocolResponse(null, false, "invalid JSON"));
    return;
  }
  if (!isRecord(request)) {
    recordCompanionActivity("protocol_error", "request must be an object", {
      method: null
    });
    socket.write(protocolResponse(null, false, "request must be an object"));
    return;
  }
  const id = request.id ?? null;
  const method = stringValue(request.method);
  if (request.token !== companionProtocolToken) {
    recordCompanionActivity("protocol_error", "unauthorized", {
      method: method ?? null
    });
    socket.write(protocolResponse(id, false, "unauthorized"));
    return;
  }
  if (!method) {
    recordCompanionActivity("protocol_error", "method is required", {
      method: null
    });
    socket.write(protocolResponse(id, false, "method is required"));
    return;
  }
  try {
    assertCompanionProtocolPermission(method);
    const result = await handleCompanionProtocolMethod(method, request.params);
    socket.write(protocolResponse(id, true, result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    const activityType = message.startsWith("permission denied") || message.startsWith("permission requires") ? "permission_denied" : "protocol_error";
    recordCompanionActivity(activityType, message, {
      method
    });
    socket.write(protocolResponse(id, false, message));
  }
}
function handleProtocolSocket(socket) {
  socket.setEncoding("utf8");
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        handleProtocolRequest(trimmedLine, socket).catch((error) => {
          socket.write(protocolResponse(null, false, error instanceof Error ? error.message : "request failed"));
        });
      }
    }
  });
}
async function writeCompanionProtocolDiscovery() {
  const discovery = {
    appName: "Desktop AI Companion",
    appVersion: electron.app.getVersion(),
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    pid: process.pid,
    transport: "unix-socket",
    socketPath: companionProtocolSocketPath,
    token: companionProtocolToken,
    methods: [...COMPANION_PROTOCOL_METHODS],
    createdAt: nowIso()
  };
  await promises.mkdir(node_path.dirname(companionProtocolDiscoveryPath), { recursive: true });
  await promises.writeFile(companionProtocolDiscoveryPath, `${JSON.stringify(discovery, null, 2)}
`, "utf8");
}
async function startCompanionProtocolService() {
  companionProtocolConfig = await loadCompanionProtocolConfig();
  permissionPolicyConfig = await loadPermissionPolicyConfig();
  companionProtocolSocketPath = resolveRuntimePath(companionProtocolConfig.socketPath);
  companionProtocolDiscoveryPath = resolveRuntimePath(companionProtocolConfig.discoveryPath);
  companionProtocolLastError = null;
  if (!companionProtocolConfig.enabled) {
    publishCompanionProtocolStatus();
    return;
  }
  companionProtocolToken = node_crypto.randomBytes(24).toString("hex");
  await promises.mkdir(node_path.dirname(companionProtocolSocketPath), { recursive: true });
  await promises.mkdir(node_path.dirname(companionProtocolDiscoveryPath), { recursive: true });
  await promises.rm(companionProtocolSocketPath, { force: true });
  companionProtocolServer = node_net.createServer(handleProtocolSocket);
  companionProtocolServer.on("error", (error) => {
    companionProtocolLastError = error instanceof Error ? error.message : "protocol server error";
    publishCompanionProtocolStatus();
  });
  await new Promise((resolvePromise, rejectPromise) => {
    companionProtocolServer?.once("error", rejectPromise);
    companionProtocolServer?.listen(companionProtocolSocketPath, () => {
      companionProtocolServer?.off("error", rejectPromise);
      resolvePromise();
    });
  });
  await writeCompanionProtocolDiscovery();
  publishCompanionProtocolStatus();
}
function stopCompanionProtocolServiceSync() {
  clearAgentRuntimeTimer();
  companionProtocolServer?.close();
  companionProtocolServer = null;
  if (companionProtocolSocketPath) {
    node_fs.rmSync(companionProtocolSocketPath, { force: true });
  }
  if (companionProtocolDiscoveryPath) {
    node_fs.rmSync(companionProtocolDiscoveryPath, { force: true });
  }
}
function publishShortcutsUpdated() {
  sendToRendererWindows(SHORTCUTS_UPDATED_CHANNEL, shortcutService?.list() ?? []);
}
function publishInputPermissionStatus(status) {
  macInputPermissionStatus = status;
  sendToRendererWindows(INPUT_PERMISSION_STATUS_CHANNEL, status);
}
function controlCenterModuleFromUnknown(value) {
  return value === "tasks" || value === "reminders" || value === "settings" || value === "integrations" || value === "plugins" || value === "status" ? value : "status";
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
  if (event.type === "leftClick") {
    const bounds = mainWindow.getContentBounds();
    const localX = event.x - bounds.x;
    const localY = event.y - bounds.y;
    if (localX >= 0 && localX <= bounds.width && localY >= 0 && localY <= bounds.height) {
      publishInteractionClick(localX, localY);
    }
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
  macInputService.setClickCaptureEnabled(nativeClickCaptureEnabled);
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
  if (raw.state === "waiting_auth" && rawTimestampMs !== null && !raw.expiresAt && rawTimestampMs + codexPluginConfig.waitingAuthTimeoutMs <= now) {
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
  if (nextState && nextState.state !== "idle") {
    declarativePluginService?.noteBusy();
  }
  declarativePluginService?.notifyCondition("codex.state", nextState?.state ?? "idle");
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
function registerCompanionProtocolHandlers() {
  electron.ipcMain.handle("agent:get-runtime-state", () => agentRuntimeState);
  electron.ipcMain.handle("agent:get-confirmation", () => agentConfirmation);
  electron.ipcMain.handle("agent:respond-confirmation", (_event, requestId, action) => {
    if (typeof requestId !== "string") {
      throw new Error("confirmation request id is required");
    }
    if (action !== "allow" && action !== "deny" && action !== "cancel") {
      throw new Error("unsupported confirmation action");
    }
    return respondAgentConfirmation(requestId, action);
  });
  electron.ipcMain.handle("companion-protocol:get-status", () => companionProtocolStatus());
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
  if (nextState) {
    declarativePluginService?.noteBusy();
  }
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
  if (nextNotification) {
    declarativePluginService?.noteBusy();
  }
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
    const installedPrefix = `${INSTALLED_ASSET_PREFIX}/`;
    let assetRoot = projectRoot;
    let assetPath = relativePath;
    if (relativePath.startsWith(installedPrefix)) {
      const installedPath = relativePath.slice(installedPrefix.length);
      const separatorIndex = installedPath.indexOf("/");
      if (separatorIndex <= 0) {
        return new Response("Invalid installed asset path", { status: 400 });
      }
      const profileId = installedPath.slice(0, separatorIndex);
      if (!/^[a-zA-Z0-9_-]+$/.test(profileId)) {
        return new Response("Invalid installed profile id", { status: 400 });
      }
      assetRoot = node_path.join(installedProfilesRoot(), profileId);
      assetPath = installedPath.slice(separatorIndex + 1);
    }
    const absolutePath = node_path.resolve(assetRoot, assetPath);
    const pathFromRoot = node_path.relative(assetRoot, absolutePath);
    if (pathFromRoot.startsWith("..") || node_path.isAbsolute(pathFromRoot)) {
      return new Response("Invalid asset path", { status: 400 });
    }
    if (!node_fs.existsSync(absolutePath)) {
      console.warn(`Asset not found: ${relativePath}`);
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
  registerCompanionProtocolHandlers();
  registerDeclarativePluginHandlers();
  registerReminderHandlers();
  registerTaskHandlers();
  registerAssetProtocol();
  shortcutService = new ShortcutService();
  await shortcutService.load();
  await startTaskService();
  await startCodexRuntimeService();
  await startCompanionProtocolService();
  await startReminderService();
  await createMainWindow();
  await startDeclarativePluginService();
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
  stopCompanionProtocolServiceSync();
  declarativePluginService?.stop();
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
