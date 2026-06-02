import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';

import type {
  DeclarativePluginFeedback,
  DeclarativePluginItemSummary,
  DeclarativePluginLoadError,
  DeclarativePluginsConfig,
  DeclarativePluginSummary
} from '../shared/types';

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
const ABSOLUTE_PATH_PATTERN = /(?:^|\s)(?:~\/|\/(?:Users|private|var|tmp|etc|opt|home|Volumes)\b|[A-Za-z]:\\)/;
const BLOCKED_FIELD_PATTERN =
  /^(?:(?:script|shell|command|module|require|import|network|fetch|write|file|path|url)s?|(?:script|shell|command|module|network|fetch|write|file|path|url).*(?:path|url|file|command|script))$/i;
const ALLOWED_PERMISSIONS = new Set(['display.speech', 'display.reaction', 'display.action']);
const ALLOWED_REACTIONS = new Set(['idle', 'reset', 'thinking', 'editing', 'coding', 'waiting', 'success', 'error']);
const MAX_RECENT_ERRORS = 12;

type PluginSource = 'builtin' | 'local';
type ConditionSource = 'agent.status' | 'codex.state';

interface IntervalTrigger {
  type: 'interval';
  intervalMs: number;
}

interface IdleTrigger {
  type: 'idle';
  idleMs: number;
  repeatIntervalMs?: number;
}

interface ConditionTrigger {
  type: 'condition';
  source: ConditionSource;
  equals: string;
}

type DeclarativePluginTrigger = IntervalTrigger | IdleTrigger | ConditionTrigger;

interface SpeechPoolEffect {
  type: 'speech_pool';
  messages: string[];
  reactions?: string[];
  ttlMs?: number;
}

interface ReactionPoolEffect {
  type: 'reaction_pool';
  reactions: string[];
  ttlMs?: number;
}

interface RandomActionEffect {
  type: 'random_action';
  ttlMs?: number;
}

type DeclarativePluginEffect = SpeechPoolEffect | ReactionPoolEffect | RandomActionEffect;

interface DeclarativePluginManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  label: string;
  description: string;
  enabledByDefault: boolean;
  profileIds?: string[];
  permissions: string[];
  cooldownMs?: number;
  triggers: DeclarativePluginTrigger[];
  effects: DeclarativePluginEffect[];
}

interface LoadedPlugin {
  manifest: DeclarativePluginManifest;
  source: PluginSource;
  enabled: boolean;
  lastTriggeredAt: string | null;
  lastTriggeredMs: number;
  lastError: string | null;
  triggerLastRunMs: number[];
}

interface RuntimeContext {
  activeProfileId: string;
  readyActions: string[];
  blockReason: string | null;
}

interface DeclarativePluginServiceOptions {
  projectRoot: string;
  userDataPath: string;
  config: DeclarativePluginsConfig;
  validateMessage: (message: unknown) => { ok: boolean; message?: string; error?: string };
  getRuntimeContext: () => Promise<RuntimeContext>;
  onFeedback: (feedback: DeclarativePluginFeedback) => void;
  onActivity: (
    type: 'plugin_trigger' | 'plugin_skip' | 'plugin_error',
    summary: string,
    details: Record<string, string | number | boolean | null>
  ) => void;
  onSummaryChanged: (summary: DeclarativePluginSummary) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(value: Record<string, unknown>, allowedKeys: string[], label: string): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported field: ${key}`);
    }
  }
}

function assertSafeManifestValue(value: unknown, key = 'manifest'): void {
  if (typeof value === 'string') {
    if (URL_PATTERN.test(value)) {
      throw new Error(`${key} contains a URL`);
    }
    if (ABSOLUTE_PATH_PATTERN.test(value) || isAbsolute(value)) {
      throw new Error(`${key} contains an absolute path`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeManifestValue(item, `${key}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    if (BLOCKED_FIELD_PATTERN.test(childKey)) {
      throw new Error(`manifest contains blocked field: ${childKey}`);
    }
    assertSafeManifestValue(childValue, childKey);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function optionalTtl(value: unknown, config: DeclarativePluginsConfig): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const ttlMs = requiredPositiveInteger(value, 'effect.ttlMs');
  if (ttlMs > config.maxTtlMs) {
    throw new Error(`effect.ttlMs exceeds ${config.maxTtlMs}`);
  }
  return ttlMs;
}

function validateReactionPool(value: unknown, label: string): string[] {
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

function validateTrigger(value: unknown, config: DeclarativePluginsConfig): DeclarativePluginTrigger {
  if (!isRecord(value)) {
    throw new Error('trigger must be an object');
  }
  if (value.type === 'interval') {
    assertAllowedKeys(value, ['type', 'intervalMs'], 'interval trigger');
    const intervalMs = requiredPositiveInteger(value.intervalMs, 'intervalMs');
    if (intervalMs < config.minIntervalMs) {
      throw new Error(`intervalMs must be at least ${config.minIntervalMs}`);
    }
    return { type: 'interval', intervalMs };
  }
  if (value.type === 'idle') {
    assertAllowedKeys(value, ['type', 'idleMs', 'repeatIntervalMs'], 'idle trigger');
    const idleMs = requiredPositiveInteger(value.idleMs, 'idleMs');
    if (idleMs < config.minIntervalMs) {
      throw new Error(`idleMs must be at least ${config.minIntervalMs}`);
    }
    const repeatIntervalMs = value.repeatIntervalMs === undefined
      ? undefined
      : requiredPositiveInteger(value.repeatIntervalMs, 'repeatIntervalMs');
    if (repeatIntervalMs !== undefined && repeatIntervalMs < config.minIntervalMs) {
      throw new Error(`repeatIntervalMs must be at least ${config.minIntervalMs}`);
    }
    return { type: 'idle', idleMs, repeatIntervalMs };
  }
  if (value.type === 'condition') {
    assertAllowedKeys(value, ['type', 'source', 'equals'], 'condition trigger');
    if (value.source !== 'agent.status' && value.source !== 'codex.state') {
      throw new Error(`unsupported condition source: ${String(value.source)}`);
    }
    return {
      type: 'condition',
      source: value.source,
      equals: requiredString(value.equals, 'condition.equals')
    };
  }
  throw new Error(`unsupported trigger type: ${String(value.type)}`);
}

function validateEffect(
  value: unknown,
  config: DeclarativePluginsConfig,
  validateMessage: DeclarativePluginServiceOptions['validateMessage']
): DeclarativePluginEffect {
  if (!isRecord(value)) {
    throw new Error('effect must be an object');
  }
  if (value.type === 'speech_pool') {
    assertAllowedKeys(value, ['type', 'messages', 'reactions', 'ttlMs'], 'speech_pool effect');
    if (!Array.isArray(value.messages) || value.messages.length === 0) {
      throw new Error('speech_pool.messages must be a non-empty array');
    }
    const messages = value.messages.map((message) => {
      const validation = validateMessage(message);
      if (!validation.ok || !validation.message) {
        throw new Error(`speech_pool message rejected: ${validation.error ?? 'invalid message'}`);
      }
      return validation.message;
    });
    return {
      type: 'speech_pool',
      messages,
      reactions: value.reactions === undefined ? undefined : validateReactionPool(value.reactions, 'speech_pool.reactions'),
      ttlMs: optionalTtl(value.ttlMs, config)
    };
  }
  if (value.type === 'reaction_pool') {
    assertAllowedKeys(value, ['type', 'reactions', 'ttlMs'], 'reaction_pool effect');
    return {
      type: 'reaction_pool',
      reactions: validateReactionPool(value.reactions, 'reaction_pool.reactions'),
      ttlMs: optionalTtl(value.ttlMs, config)
    };
  }
  if (value.type === 'random_action') {
    assertAllowedKeys(value, ['type', 'ttlMs'], 'random_action effect');
    return { type: 'random_action', ttlMs: optionalTtl(value.ttlMs, config) };
  }
  throw new Error(`unsupported effect type: ${String(value.type)}`);
}

function validateManifest(
  value: unknown,
  config: DeclarativePluginsConfig,
  validateMessage: DeclarativePluginServiceOptions['validateMessage']
): DeclarativePluginManifest {
  if (!isRecord(value)) {
    throw new Error('manifest must be an object');
  }
  assertSafeManifestValue(value);
  assertAllowedKeys(
    value,
    [
      'schemaVersion',
      'id',
      'version',
      'label',
      'description',
      'enabledByDefault',
      'profileIds',
      'permissions',
      'cooldownMs',
      'triggers',
      'effects'
    ],
    'manifest'
  );
  if (value.schemaVersion !== 1) {
    throw new Error('schemaVersion must be 1');
  }
  const id = requiredString(value.id, 'id');
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new Error(`invalid plugin id: ${id}`);
  }
  const version = requiredString(value.version, 'version');
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`invalid plugin version: ${version}`);
  }
  if (typeof value.enabledByDefault !== 'boolean') {
    throw new Error('enabledByDefault must be boolean');
  }
  if (!Array.isArray(value.permissions) || value.permissions.length === 0) {
    throw new Error('permissions must be a non-empty array');
  }
  const permissions = value.permissions.map((permission) => {
    const normalized = requiredString(permission, 'permission');
    if (!ALLOWED_PERMISSIONS.has(normalized)) {
      throw new Error(`unsupported permission: ${normalized}`);
    }
    return normalized;
  });
  if (!Array.isArray(value.triggers) || value.triggers.length === 0) {
    throw new Error('triggers must be a non-empty array');
  }
  if (!Array.isArray(value.effects) || value.effects.length === 0) {
    throw new Error('effects must be a non-empty array');
  }
  const cooldownMs = value.cooldownMs === undefined
    ? config.minCooldownMs
    : requiredPositiveInteger(value.cooldownMs, 'cooldownMs');
  if (cooldownMs < config.minCooldownMs) {
    throw new Error(`cooldownMs must be at least ${config.minCooldownMs}`);
  }
  const profileIds = value.profileIds === undefined
    ? undefined
    : Array.isArray(value.profileIds)
      ? value.profileIds.map((profileId) => requiredString(profileId, 'profileId'))
      : (() => {
          throw new Error('profileIds must be an array');
        })();
  return {
    schemaVersion: 1,
    id,
    version,
    label: requiredString(value.label, 'label'),
    description: requiredString(value.description, 'description'),
    enabledByDefault: value.enabledByDefault,
    profileIds,
    permissions,
    cooldownMs,
    triggers: value.triggers.map((trigger) => validateTrigger(trigger, config)),
    effects: value.effects.map((effect) => validateEffect(effect, config, validateMessage))
  };
}

function randomItem<T>(values: T[]): T | null {
  return values[Math.floor(Math.random() * values.length)] ?? null;
}

function safeRelativeDirectory(path: string, label: string): string {
  const normalized = normalize(path).replaceAll('\\', '/');
  if (!path || isAbsolute(path) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${label} must be a relative directory`);
  }
  return normalized;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'plugin error';
  return message
    .replace(/(?:~\/|\/(?:Users|private|var|tmp|etc|opt|home|Volumes)\/[^\s:]*)/g, '[redacted-path]')
    .replace(/\btoken\b/gi, 'value')
    .replace(/\b(?:socketPath|discoveryPath)\b/g, '[redacted-field]')
    .slice(0, 180);
}

export class DeclarativePluginService {
  private readonly builtinDirectory: string;
  private readonly localDirectory: string;
  private readonly toggleStatePath: string;
  private readonly plugins = new Map<string, LoadedPlugin>();
  private readonly recentErrors: DeclarativePluginLoadError[] = [];
  private readonly conditionValues = new Map<ConditionSource, string>();
  private overrides: Record<string, boolean> = {};
  private timer: NodeJS.Timeout | null = null;
  private lastBusyAt = Date.now();
  private feedbackSequence = 0;

  constructor(private readonly options: DeclarativePluginServiceOptions) {
    this.builtinDirectory = resolve(
      options.projectRoot,
      safeRelativeDirectory(options.config.builtinDirectory, 'builtinDirectory')
    );
    this.localDirectory = resolve(
      options.userDataPath,
      safeRelativeDirectory(options.config.localDirectory, 'localDirectory')
    );
    this.toggleStatePath = resolve(
      options.userDataPath,
      safeRelativeDirectory(options.config.toggleStateFile, 'toggleStateFile')
    );
  }

  async start(): Promise<void> {
    await mkdir(this.localDirectory, { recursive: true });
    await this.loadOverrides();
    await this.refresh();
    if (!this.options.config.enabled) {
      return;
    }
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) => this.recordError('builtin', 'scheduler', error));
    }, Math.max(250, this.options.config.schedulerIntervalMs));
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async refresh(): Promise<DeclarativePluginSummary> {
    this.plugins.clear();
    this.recentErrors.length = 0;
    const builtinIds = await this.loadDirectory(this.builtinDirectory, 'builtin');
    await this.loadDirectory(this.localDirectory, 'local', builtinIds);
    const summary = this.summary();
    this.options.onSummaryChanged(summary);
    return summary;
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<DeclarativePluginSummary> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`unknown plugin: ${pluginId}`);
    }
    plugin.enabled = enabled;
    this.overrides[pluginId] = enabled;
    await mkdir(dirname(this.toggleStatePath), { recursive: true });
    await writeFile(this.toggleStatePath, `${JSON.stringify({ version: 1, overrides: this.overrides }, null, 2)}\n`, 'utf8');
    const summary = this.summary();
    this.options.onSummaryChanged(summary);
    return summary;
  }

  summary(): DeclarativePluginSummary {
    const plugins = [...this.plugins.values()]
      .map((plugin): DeclarativePluginItemSummary => ({
        id: plugin.manifest.id,
        version: plugin.manifest.version,
        label: plugin.manifest.label,
        description: plugin.manifest.description,
        source: plugin.source,
        permissions: [...plugin.manifest.permissions],
        profileIds: [...(plugin.manifest.profileIds ?? [])],
        enabledByDefault: plugin.manifest.enabledByDefault,
        enabled: plugin.enabled,
        lastTriggeredAt: plugin.lastTriggeredAt,
        lastError: plugin.lastError
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    return {
      enabled: this.options.config.enabled,
      pluginCount: plugins.length,
      enabledCount: plugins.filter((plugin) => plugin.enabled).length,
      plugins,
      recentErrors: [...this.recentErrors]
    };
  }

  notifyCondition(source: ConditionSource, value: string): void {
    const previous = this.conditionValues.get(source);
    this.conditionValues.set(source, value);
    if (previous === value || !this.options.config.enabled) {
      return;
    }
    for (const plugin of this.plugins.values()) {
      plugin.manifest.triggers.forEach((trigger, index) => {
        if (trigger.type === 'condition' && trigger.source === source && trigger.equals === value) {
          this.trigger(plugin, index, `condition:${source}:${value}`).catch((error: unknown) => {
            this.recordPluginError(plugin, error);
          });
        }
      });
    }
  }

  noteBusy(): void {
    this.lastBusyAt = Date.now();
  }

  private async tick(): Promise<void> {
    const context = await this.options.getRuntimeContext();
    const now = Date.now();
    if (context.blockReason) {
      this.lastBusyAt = now;
    }
    for (const plugin of this.plugins.values()) {
      plugin.manifest.triggers.forEach((trigger, index) => {
        const lastRunMs = plugin.triggerLastRunMs[index] ?? 0;
        if (trigger.type === 'interval' && now - lastRunMs >= trigger.intervalMs) {
          this.trigger(plugin, index, 'interval').catch((error: unknown) => this.recordPluginError(plugin, error));
        }
        if (trigger.type === 'idle') {
          const repeatIntervalMs = trigger.repeatIntervalMs ?? trigger.idleMs;
          if (now - this.lastBusyAt >= trigger.idleMs && now - lastRunMs >= repeatIntervalMs) {
            this.trigger(plugin, index, 'idle').catch((error: unknown) => this.recordPluginError(plugin, error));
          }
        }
      });
    }
  }

  private async trigger(plugin: LoadedPlugin, triggerIndex: number, trigger: string): Promise<void> {
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
      this.options.onActivity('plugin_skip', `plugin skipped: ${plugin.manifest.id}`, {
        pluginId: plugin.manifest.id,
        reason: context.blockReason,
        trigger
      });
      return;
    }

    let message: string | null = null;
    let reaction: string | null = null;
    let action: string | null = null;
    let ttlMs = this.options.config.defaultTtlMs;
    for (const effect of plugin.manifest.effects) {
      ttlMs = Math.max(ttlMs, effect.ttlMs ?? this.options.config.defaultTtlMs);
      if (effect.type === 'speech_pool') {
        message = randomItem(effect.messages);
        reaction = effect.reactions ? randomItem(effect.reactions) : reaction;
      } else if (effect.type === 'reaction_pool') {
        reaction = randomItem(effect.reactions);
      } else if (effect.type === 'random_action') {
        action = randomItem(context.readyActions);
      }
    }
    ttlMs = Math.min(ttlMs, this.options.config.maxTtlMs);
    if (!message && !reaction && !action) {
      throw new Error('plugin produced no runtime-ready feedback');
    }

    this.feedbackSequence += 1;
    plugin.lastTriggeredMs = now;
    plugin.lastTriggeredAt = new Date(now).toISOString();
    plugin.lastError = null;
    plugin.triggerLastRunMs[triggerIndex] = now;
    const feedback: DeclarativePluginFeedback = {
      id: `plugin-${now}-${this.feedbackSequence}`,
      pluginId: plugin.manifest.id,
      message,
      reaction,
      action,
      expiresAt: new Date(now + ttlMs).toISOString()
    };
    this.options.onActivity('plugin_trigger', `plugin triggered: ${plugin.manifest.id}`, {
      pluginId: plugin.manifest.id,
      trigger,
      ttlMs
    });
    this.options.onFeedback(feedback);
    this.options.onSummaryChanged(this.summary());
  }

  private async loadOverrides(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.toggleStatePath, 'utf8')) as unknown;
      this.overrides = isRecord(value) && isRecord(value.overrides)
        ? Object.fromEntries(Object.entries(value.overrides).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'))
        : {};
    } catch {
      this.overrides = {};
    }
  }

  private async loadDirectory(directory: string, source: PluginSource, reservedIds = new Set<string>()): Promise<Set<string>> {
    const ids = new Set(reservedIds);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (source === 'local') {
        return ids;
      }
      this.recordError(source, basename(directory), error);
      return ids;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.plugin.json')) {
        continue;
      }
      if (this.plugins.size >= this.options.config.maxPlugins) {
        this.recordError(source, entry.name, new Error(`plugin limit exceeded: ${this.options.config.maxPlugins}`));
        continue;
      }
      try {
        const value = JSON.parse(await readFile(join(directory, entry.name), 'utf8')) as unknown;
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
          triggerLastRunMs: manifest.triggers.map((trigger) => (trigger.type === 'interval' ? loadedAt : 0))
        });
      } catch (error) {
        this.recordError(source, entry.name, error);
      }
    }
    return ids;
  }

  private recordPluginError(plugin: LoadedPlugin, error: unknown): void {
    const message = safeErrorMessage(error);
    plugin.lastError = message;
    this.options.onActivity('plugin_error', `plugin error: ${plugin.manifest.id}`, {
      pluginId: plugin.manifest.id,
      reason: message
    });
    this.options.onSummaryChanged(this.summary());
  }

  private recordError(source: PluginSource, file: string, error: unknown): void {
    const message = safeErrorMessage(error);
    this.recentErrors.push({ source, file: basename(file), message });
    while (this.recentErrors.length > MAX_RECENT_ERRORS) {
      this.recentErrors.shift();
    }
    this.options.onActivity('plugin_error', `plugin load error: ${basename(file)}`, {
      source,
      file: basename(file),
      reason: message
    });
  }
}
