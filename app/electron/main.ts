import { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, shell } from 'electron';
import type { MenuItemConstructorOptions, Rectangle } from 'electron';
import { existsSync, rmSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  COMPANION_PROTOCOL_METHODS,
  COMPANION_PROTOCOL_VERSION,
  mapAgentReaction,
  mapAgentStatus,
  normalizeAgentStatus,
  validateAgentMessage
} from '../shared/agentProtocol';
import type {
  ActionRegistryConfig,
  AgentConfirmation,
  AgentConfirmationAction,
  AgentRenderState,
  CodexPluginConfig,
  CodexRenderState,
  CodexRuntimeState,
  CodexRuntimeStatus,
  CompanionCommand,
  CompanionConfig,
  CompanionProtocolConfig,
  CompanionProtocolStatus,
  ControlCenterModule,
  CreateReminderInput,
  CreateTaskInput,
  InputPermissionStatus,
  InteractionRulesConfig,
  ManualRenderSelection,
  PluginsConfig,
  ProfileCapabilityManifest,
  ReminderNotification,
  ReminderPluginConfig,
  ShortcutBinding,
  StatesConfig,
  TaskCenterSnapshot,
  TaskNotification,
  TaskPluginConfig,
  TaskStatus,
  MouseHitRegion,
  MouseMode,
  PetProfileConfig,
  PetProfileDefinition,
  PetProfileState,
  PetProfileSummary,
  WindowControls
} from '../shared/types';
import { MacInputService } from './macInput';
import { DEFAULT_REMINDER_PLUGIN_CONFIG, ReminderService } from './reminders';
import { moduleForShortcutId, ShortcutService } from './shortcuts';
import { DEFAULT_TASK_PLUGIN_CONFIG, TaskService } from './tasks';

const WINDOW_WIDTH = 512;
const WINDOW_HEIGHT = 576;
const ASSET_SCHEME = 'companion-asset';
const COMPANION_COMMAND_CHANNEL = 'companion:command';
const CODEX_RUNTIME_STATE_CHANNEL = 'codex:runtime-state';
const AGENT_RUNTIME_STATE_CHANNEL = 'agent:runtime-state';
const AGENT_CONFIRMATION_CHANNEL = 'agent:confirmation';
const COMPANION_PROTOCOL_STATUS_CHANNEL = 'companion-protocol:status';
const REMINDER_RUNTIME_STATE_CHANNEL = 'reminder:runtime-state';
const REMINDERS_UPDATED_CHANNEL = 'reminder:updated';
const TASK_NOTIFICATION_CHANNEL = 'task:notification';
const TASKS_UPDATED_CHANNEL = 'task:updated';
const MOUSE_HIT_TEST_SAMPLE_CHANNEL = 'mouse:hit-test-sample';
const MANUAL_RENDER_SELECTION_CHANNEL = 'render:manual-selection';
const PET_PROFILE_CHANGED_CHANNEL = 'pet-profile:changed';
const CONTROL_CENTER_MODULE_CHANNEL = 'control-center:module';
const SHORTCUTS_UPDATED_CHANNEL = 'shortcuts:updated';
const INPUT_PERMISSION_STATUS_CHANNEL = 'input-permission:status';
const INTERACTION_DRAG_ACTIVE_CHANNEL = 'interaction:drag-active';
const MAX_MOUSE_HIT_REGIONS = 2400;
const CONTROL_CENTER_WIDTH = 420;
const CONTROL_CENTER_HEIGHT = 560;
const CONFIRMATION_DEFAULT_TTL_MS = 60000;
const CONFIRMATION_MAX_TTL_MS = 300000;
const CONFIRMATION_FEEDBACK_TTL_MS = 3000;
const ACTIVITY_BUFFER_LIMIT = 50;
const ACTIVITY_DEFAULT_LIMIT = 20;
const V12_BLOCKED_INTERACTION_ACTIONS = [
  'click_head_happy',
  'click_body_confused',
  'drag_start_lift',
  'drag_end_dizzy'
] as const;
const DEFAULT_WINDOW_CONTROLS: WindowControls = {
  scale: 1,
  mouseMode: 'smart',
  mousePassthrough: true
};
const DEFAULT_CODEX_PLUGIN_CONFIG: CodexPluginConfig = {
  enabled: true,
  runtimeStatePath: '~/.desktop-ai-companion/runtime_state/codex_state.json',
  pollIntervalMs: 1000,
  thinkingTimeoutMs: 30000,
  successHoldMs: 4000,
  errorHoldMs: 8000
};
const DEFAULT_COMPANION_PROTOCOL_CONFIG: CompanionProtocolConfig = {
  enabled: true,
  discoveryPath: '~/.desktop-ai-companion/discovery/companion.json',
  socketPath: '~/.desktop-ai-companion/ipc/companion.sock',
  messageMaxChars: 80,
  cooldownMs: 1500,
  defaultTtlMs: 6000,
  maxTtlMs: 15000
};
const CODEX_RUNTIME_STATES = new Set<CodexRuntimeStatus>([
  'idle',
  'coding',
  'thinking',
  'waiting_auth',
  'success',
  'error'
]);
const COMPANION_STATES = new Set([
  'idle',
  'reading',
  'coding',
  'thinking',
  'waiting_auth',
  'success',
  'error',
  'reminder',
  'sleep'
]);

type CompanionActivityType =
  | 'say'
  | 'react'
  | 'agent_state'
  | 'agent_clear'
  | 'confirmation_request'
  | 'confirmation_result'
  | 'profile_select'
  | 'protocol_error';

interface CompanionActivityEntry {
  id: number;
  type: CompanionActivityType;
  timestamp: string;
  summary: string;
  details: Record<string, string | number | boolean | null>;
}

protocol.registerSchemesAsPrivileged([
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

function hasProjectAssets(candidate: string): boolean {
  return (
    existsSync(join(candidate, 'data', 'config', 'companion.config.json')) &&
    existsSync(join(candidate, 'assets'))
  );
}

function resolveProjectRoot(): string {
  const candidates = [
    process.env.DESKTOP_AI_COMPANION_ROOT,
    process.cwd(),
    app.getAppPath(),
    resolve(__dirname, '../..'),
    resolve(__dirname, '../../..')
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const absoluteCandidate = resolve(candidate);
    if (hasProjectAssets(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  return app.getAppPath();
}

const projectRoot = resolveProjectRoot();
let activeProfileId = 'legacy_real';
let activeCompanionConfig: CompanionConfig | null = null;
let mainWindowRef: BrowserWindow | null = null;
let controlCenterWindowRef: BrowserWindow | null = null;
let windowControls: WindowControls = { ...DEFAULT_WINDOW_CONTROLS };
let codexPluginConfig: CodexPluginConfig = { ...DEFAULT_CODEX_PLUGIN_CONFIG };
let codexRuntimePath = '';
let codexRuntimeState: CodexRenderState | null = null;
let codexRuntimeWatcher: FSWatcher | null = null;
let codexRuntimePollTimer: NodeJS.Timeout | null = null;
let codexRuntimeLastPayload = '';
let companionProtocolConfig: CompanionProtocolConfig = { ...DEFAULT_COMPANION_PROTOCOL_CONFIG };
let companionProtocolServer: Server | null = null;
let companionProtocolToken = '';
let companionProtocolSocketPath = '';
let companionProtocolDiscoveryPath = '';
let companionProtocolLastError: string | null = null;
let agentRuntimeState: AgentRenderState | null = null;
let agentRuntimeTimer: NodeJS.Timeout | null = null;
let agentRuntimeLastPayload = '';
let lastAgentMutationAt = 0;
let agentConfirmation: AgentConfirmation | null = null;
let agentConfirmationTimer: NodeJS.Timeout | null = null;
let companionActivitySequence = 0;
const companionActivities: CompanionActivityEntry[] = [];
let reminderPluginConfig: ReminderPluginConfig = { ...DEFAULT_REMINDER_PLUGIN_CONFIG };
let reminderService: ReminderService | null = null;
let reminderRuntimeState: ReminderNotification | null = null;
let reminderRuntimeLastPayload = '';
let reminderPollTimer: NodeJS.Timeout | null = null;
let taskPluginConfig: TaskPluginConfig = { ...DEFAULT_TASK_PLUGIN_CONFIG };
let taskService: TaskService | null = null;
let taskNotification: TaskNotification | null = null;
let taskNotificationLastPayload = '';
let taskPollTimer: NodeJS.Timeout | null = null;
let manualRenderSelection: ManualRenderSelection | null = null;
let shortcutService: ShortcutService | null = null;
let macInputService: MacInputService | null = null;
let macInputPermissionStatus: InputPermissionStatus = process.platform === 'darwin' ? 'unknown' : 'denied';
let macInputDragPoint: { x: number; y: number } | null = null;
let macInputDragging = false;
let lastMouseHitCanInteract = false;
let mouseHitRegions: Rectangle[] = [];
let windowDragActive = false;
let windowIgnoringMouseEvents: boolean | null = null;
let mouseHitTestPollTimer: NodeJS.Timeout | null = null;

function resolveProjectPath(...segments: string[]): string {
  return join(projectRoot, ...segments);
}

async function readJsonFile<T>(...segments: string[]): Promise<T> {
  const raw = await readFile(resolveProjectPath(...segments), 'utf8');
  return JSON.parse(raw) as T;
}

async function readJsonPath<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as T;
}

function resolveProfilePath(path: string): string {
  return isAbsolute(path) ? path : resolveProjectPath(path);
}

async function loadPetProfileConfig(): Promise<PetProfileConfig> {
  return readJsonFile<PetProfileConfig>('data', 'config', 'pet_profiles.config.json');
}

function defaultPetProfileId(config: PetProfileConfig): string {
  return config.defaultProfileId || 'legacy_real';
}

function profileDefinition(config: PetProfileConfig, profileId: string): PetProfileDefinition {
  const profile = config.profiles[profileId] ?? config.profiles[defaultPetProfileId(config)];
  if (!profile) {
    throw new Error('No usable pet profile is configured.');
  }
  return profile;
}

function hasRenderableActionAssets(action: { webmPath: string; fallbackPath: string }): boolean {
  return existsSync(resolveProfilePath(action.webmPath)) && existsSync(resolveProfilePath(action.fallbackPath));
}

function materializeRegistryAvailability(
  profile: PetProfileDefinition,
  registry: ActionRegistryConfig
): ActionRegistryConfig {
  if (profile.locked) {
    return registry;
  }

  const nextRegistry = structuredClone(registry);
  for (const action of Object.values(nextRegistry.actions)) {
    action.available = Boolean(action.runtime && hasRenderableActionAssets(action));
  }
  return nextRegistry;
}

async function readProfileJson<T>(profile: PetProfileDefinition, key: keyof PetProfileDefinition): Promise<T> {
  const value = profile[key];
  if (typeof value !== 'string') {
    throw new Error(`Profile ${profile.id} is missing ${String(key)}.`);
  }
  return readJsonPath<T>(resolveProfilePath(value));
}

function profileStatePath(): string {
  return join(app.getPath('userData'), 'pet-profile-state.json');
}

async function saveSelectedProfile(): Promise<void> {
  const settingsPath = profileStatePath();
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify({ profileId: activeProfileId }, null, 2) + '\n', 'utf8');
}

async function loadSelectedProfile(): Promise<void> {
  try {
    const payload = await readJsonPath<{ profileId?: unknown }>(profileStatePath());
    if (typeof payload.profileId === 'string') {
      activeProfileId = payload.profileId;
    }
  } catch {
    activeProfileId = 'legacy_real';
  }
}

async function profileReady(profile: PetProfileDefinition): Promise<boolean> {
  for (const key of ['companionConfigPath', 'statesConfigPath', 'actionRegistryPath'] as const) {
    if (!existsSync(resolveProfilePath(profile[key]))) {
      return false;
    }
  }

  try {
    const registry = await readProfileJson<ActionRegistryConfig>(profile, 'actionRegistryPath');
    const requiredAction = registry.actions[profile.requiredAction];
    return Boolean(requiredAction && hasRenderableActionAssets(requiredAction));
  } catch {
    return false;
  }
}

async function summarizeProfile(profile: PetProfileDefinition): Promise<PetProfileSummary> {
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

async function petProfileState(): Promise<PetProfileState> {
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

async function activeProfileDefinition(): Promise<PetProfileDefinition> {
  const config = await loadPetProfileConfig();
  const defaultProfileId = defaultPetProfileId(config);
  const requestedProfile = profileDefinition(config, activeProfileId);

  if (requestedProfile.id !== defaultProfileId && !(await profileReady(requestedProfile))) {
    activeProfileId = defaultProfileId;
    await saveSelectedProfile();
  } else {
    activeProfileId = requestedProfile.id;
  }

  return profileDefinition(config, activeProfileId);
}

async function readActiveCompanionConfig(): Promise<CompanionConfig> {
  const profile = await activeProfileDefinition();
  return readProfileJson<CompanionConfig>(profile, 'companionConfigPath');
}

async function readActiveStatesConfig(): Promise<StatesConfig> {
  const profile = await activeProfileDefinition();
  return readProfileJson<StatesConfig>(profile, 'statesConfigPath');
}

async function readActiveActionRegistryConfig(): Promise<ActionRegistryConfig> {
  const profile = await activeProfileDefinition();
  const registry = await readProfileJson<ActionRegistryConfig>(profile, 'actionRegistryPath');
  return materializeRegistryAvailability(profile, registry);
}

async function readActiveInteractionRulesConfig(): Promise<InteractionRulesConfig> {
  const profile = await activeProfileDefinition();
  const rulesPath = profile.interactionRulesPath ?? 'data/config/interaction_rules.config.json';
  return readJsonPath<InteractionRulesConfig>(resolveProfilePath(rulesPath));
}

async function readProfileCapabilityManifest(profile: PetProfileDefinition): Promise<ProfileCapabilityManifest | null> {
  if (!profile.profileManifestPath) {
    return null;
  }
  return readJsonPath<ProfileCapabilityManifest>(resolveProfilePath(profile.profileManifestPath));
}

function fallbackProfileCapabilityManifest(
  profile: PetProfileDefinition,
  ready: boolean
): ProfileCapabilityManifest {
  return {
    version: 1,
    profileId: profile.id,
    label: profile.label,
    stage: profile.locked ? 'stable' : 'in_progress',
    summary: profile.description,
    capabilities: {
      mcpLayers: ['L1_basic_remote_control'],
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
        currentEntry: 'control_center_temp',
        futureEntry: 'companion_bubble_pending_assets'
      }
    },
    assets: {
      runtimeReadyActions: ready ? [profile.requiredAction] : [],
      missingSourceActions: [],
      blockedByVideoActions: [],
      videoLedgerPath: 'docs/10_video_supply_progress.md',
      actionProgressPath: profile.actionProgressPath
    },
    distribution: {
      publishable: false,
      license: 'TBD',
      provenance: 'profile manifest fallback',
      notes: 'No explicit profile manifest is configured.'
    }
  };
}

function safeProfileCapabilitiesPayload(
  profile: PetProfileDefinition,
  summary: PetProfileSummary,
  manifest: ProfileCapabilityManifest
): Record<string, unknown> {
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

async function profileCapabilitiesPayload(params: unknown): Promise<Record<string, unknown>> {
  const config = await loadPetProfileConfig();
  const profileId = isRecord(params) && typeof params.profileId === 'string' ? params.profileId.trim() : activeProfileId;
  const profile = config.profiles[profileId];
  if (!profile) {
    throw new Error(`unknown profileId: ${profileId}`);
  }
  const summary = await summarizeProfile(profile);
  const manifest = (await readProfileCapabilityManifest(profile)) ?? fallbackProfileCapabilityManifest(profile, summary.ready);
  return safeProfileCapabilitiesPayload(profile, summary, manifest);
}

async function profileCapabilitiesSummaryPayload(profileId: string): Promise<Record<string, unknown> | null> {
  const config = await loadPetProfileConfig();
  const profile = config.profiles[profileId];
  if (!profile) {
    return null;
  }
  const summary = await summarizeProfile(profile);
  const manifest = (await readProfileCapabilityManifest(profile)) ?? fallbackProfileCapabilityManifest(profile, summary.ready);
  return {
    profileId: profile.id,
    stage: manifest.stage,
    ready: summary.ready,
    mcpLayers: manifest.capabilities.mcpLayers,
    readyInteractions: manifest.capabilities.interactions.ready,
    missingSourceActions: manifest.assets.missingSourceActions,
    blockedByVideoActions: manifest.assets.blockedByVideoActions,
    confirmationEntry: manifest.capabilities.confirmation.currentEntry,
    videoLedger: manifest.assets.videoLedgerPath
  };
}

function sendToRendererWindows(channel: string, payload: unknown): void {
  for (const window of [mainWindowRef, controlCenterWindowRef]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
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

function resolveRuntimePath(path: string): string {
  const expandedPath = expandHomePath(path);
  return isAbsolute(expandedPath) ? expandedPath : resolve(projectRoot, expandedPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function timestampMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function safeSummaryText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const validation = validateAgentMessage(value, { maxChars: companionProtocolConfig.messageMaxChars });
  return validation.ok ? validation.message ?? null : null;
}

function recordCompanionActivity(
  type: CompanionActivityType,
  summary: string,
  details: Record<string, string | number | boolean | null> = {}
): void {
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

function activityLimitFromParams(params: unknown): number {
  if (params === undefined || params === null) {
    return ACTIVITY_DEFAULT_LIMIT;
  }
  if (!isRecord(params)) {
    throw new Error('params must be an object');
  }
  if (params.limit === undefined) {
    return ACTIVITY_DEFAULT_LIMIT;
  }
  const limit = numberValue(params.limit);
  if (limit === undefined || !Number.isInteger(limit) || limit < 0 || limit > ACTIVITY_BUFFER_LIMIT) {
    throw new Error(`limit must be an integer between 0 and ${ACTIVITY_BUFFER_LIMIT}`);
  }
  return limit;
}

function registerConfigHandlers(): void {
  ipcMain.handle('config:get-companion', () => readActiveCompanionConfig());
  ipcMain.handle('config:get-states', () => readActiveStatesConfig());
  ipcMain.handle('config:get-action-registry', () => readActiveActionRegistryConfig());
  ipcMain.handle('config:get-interaction-rules', () => readActiveInteractionRulesConfig());
}

function publishPetProfileState(state: PetProfileState): void {
  sendToRendererWindows(PET_PROFILE_CHANGED_CHANNEL, state);
}

function registerPetProfileHandlers(): void {
  ipcMain.handle('pet-profile:list', () => petProfileState());
  ipcMain.handle('pet-profile:set', async (_event, profileId: unknown) => {
    if (typeof profileId !== 'string') {
      throw new Error('Invalid pet profile id.');
    }
    return selectPetProfile(profileId);
  });
}

async function selectPetProfile(profileId: string): Promise<PetProfileState> {
  const config = await loadPetProfileConfig();
  const profile = config.profiles[profileId];
  if (!profile) {
    throw new Error(`Unknown pet profile: ${profileId}`);
  }
  if (profile.id !== defaultPetProfileId(config) && !(await profileReady(profile))) {
    throw new Error(profile.description ? `${profile.label} 素材未就绪。` : 'Pet profile is not ready.');
  }

  activeProfileId = profile.id;
  activeCompanionConfig = await readActiveCompanionConfig();
  manualRenderSelection = null;
  await saveSelectedProfile();
  publishManualRenderSelection();

  const state = await petProfileState();
  publishPetProfileState(state);
  recordCompanionActivity('profile_select', `profile selected: ${profile.id}`, {
    profileId: profile.id,
    ready: true
  });
  return state;
}

async function loadCodexPluginConfig(): Promise<CodexPluginConfig> {
  try {
    const pluginsConfig = await readJsonFile<PluginsConfig>('data', 'config', 'plugins.config.json');
    return {
      ...DEFAULT_CODEX_PLUGIN_CONFIG,
      ...pluginsConfig.plugins.codex_plugin
    };
  } catch (error) {
    console.warn('Failed to load codex plugin config; using defaults.', error);
    return { ...DEFAULT_CODEX_PLUGIN_CONFIG };
  }
}

async function loadCompanionProtocolConfig(): Promise<CompanionProtocolConfig> {
  try {
    const pluginsConfig = await readJsonFile<PluginsConfig>('data', 'config', 'plugins.config.json');
    return {
      ...DEFAULT_COMPANION_PROTOCOL_CONFIG,
      ...pluginsConfig.plugins.companion_protocol
    };
  } catch (error) {
    console.warn('Failed to load companion protocol config; using defaults.', error);
    return { ...DEFAULT_COMPANION_PROTOCOL_CONFIG };
  }
}

async function loadReminderPluginConfig(): Promise<ReminderPluginConfig> {
  try {
    const pluginsConfig = await readJsonFile<PluginsConfig>('data', 'config', 'plugins.config.json');
    const reminderConfig = pluginsConfig.plugins.reminder_plugin ?? {};

    return {
      ...DEFAULT_REMINDER_PLUGIN_CONFIG,
      ...reminderConfig,
      quickCreateMinutes: reminderConfig.quickCreateMinutes ?? DEFAULT_REMINDER_PLUGIN_CONFIG.quickCreateMinutes
    };
  } catch (error) {
    console.warn('Failed to load reminder plugin config; using defaults.', error);
    return { ...DEFAULT_REMINDER_PLUGIN_CONFIG };
  }
}

async function loadTaskPluginConfig(): Promise<TaskPluginConfig> {
  try {
    const pluginsConfig = await readJsonFile<PluginsConfig>('data', 'config', 'plugins.config.json');
    return {
      ...DEFAULT_TASK_PLUGIN_CONFIG,
      ...pluginsConfig.plugins.task_plugin
    };
  } catch (error) {
    console.warn('Failed to load task plugin config; using defaults.', error);
    return { ...DEFAULT_TASK_PLUGIN_CONFIG };
  }
}

function clampScale(scale: number, companionConfig: CompanionConfig): number {
  const { defaultScale, minScale, maxScale } = companionConfig.renderer;

  if (!Number.isFinite(scale)) {
    return defaultScale;
  }

  return Number(Math.min(Math.max(scale, minScale), maxScale).toFixed(2));
}

function windowSizeForScale(scale: number): { width: number; height: number } {
  return {
    width: Math.round(WINDOW_WIDTH * scale),
    height: Math.round(WINDOW_HEIGHT * scale)
  };
}

function setFixedWindowContentSize(mainWindow: BrowserWindow, scale: number): void {
  const { width, height } = windowSizeForScale(scale);

  mainWindow.setMinimumSize(width, height);
  mainWindow.setMaximumSize(width, height);
  mainWindow.setContentSize(width, height);
}

function applyWindowScale(mainWindow: BrowserWindow, requestedScale: number): number {
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

function setWindowMouseIgnore(mainWindow: BrowserWindow, ignore: boolean): void {
  if (windowIgnoringMouseEvents === ignore) {
    return;
  }

  mainWindow.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
  windowIgnoringMouseEvents = ignore;
}

function sanitizeMouseHitRegions(regions: unknown): Rectangle[] {
  if (!Array.isArray(regions)) {
    return [];
  }

  const nextRegions: Rectangle[] = [];

  for (const region of regions.slice(0, MAX_MOUSE_HIT_REGIONS)) {
    if (!isRecord(region)) {
      continue;
    }

    const x = numberValue(region.x);
    const y = numberValue(region.y);
    const width = numberValue(region.width);
    const height = numberValue(region.height);

    if (x === undefined || y === undefined || width === undefined || height === undefined) {
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

function setMouseHitRegions(regions: MouseHitRegion[] | unknown): void {
  mouseHitRegions = sanitizeMouseHitRegions(regions);
  syncMacInputHitRegions();
}

function pointInMouseHitRegions(x: number, y: number): boolean {
  return mouseHitRegions.some(
    (region) =>
      x >= region.x &&
      x <= region.x + region.width &&
      y >= region.y &&
      y <= region.y + region.height
  );
}

function syncMacInputHitRegions(): void {
  const mainWindow = mainWindowRef;

  if (!mainWindow || mainWindow.isDestroyed()) {
    macInputService?.syncHitRegions(null, []);
    return;
  }

  macInputService?.syncHitRegions(mainWindow.getContentBounds(), mouseHitRegions);
}

function applyMouseHitTest(mainWindow: BrowserWindow, canInteract: boolean): boolean {
  lastMouseHitCanInteract = canInteract;

  if (windowControls.mouseMode === 'interactive' || windowDragActive) {
    setWindowMouseIgnore(mainWindow, false);
    return canInteract;
  }

  setWindowMouseIgnore(mainWindow, !canInteract);
  return canInteract;
}

function applyMouseMode(mainWindow: BrowserWindow, mode: MouseMode): WindowControls {
  windowControls = {
    ...windowControls,
    mouseMode: mode,
    mousePassthrough: mode === 'smart'
  };
  applyMouseHitTest(mainWindow, mode === 'interactive' ? true : lastMouseHitCanInteract);
  pollMouseHitTest();

  return windowControls;
}

function applyMousePassthrough(mainWindow: BrowserWindow, enabled: boolean): boolean {
  return applyMouseMode(mainWindow, enabled ? 'smart' : 'interactive').mousePassthrough;
}

function pollMouseHitTest(): void {
  const mainWindow = mainWindowRef;
  if (!mainWindow || mainWindow.isDestroyed() || windowControls.mouseMode !== 'smart') {
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const bounds = mainWindow.getContentBounds();
  const inside =
    cursor.x >= bounds.x &&
    cursor.x <= bounds.x + bounds.width &&
    cursor.y >= bounds.y &&
    cursor.y <= bounds.y + bounds.height;

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

function startMouseHitTestPolling(): void {
  if (mouseHitTestPollTimer) {
    clearInterval(mouseHitTestPollTimer);
  }

  mouseHitTestPollTimer = setInterval(pollMouseHitTest, 50);
  mouseHitTestPollTimer.unref();
}

function registerWindowControlHandlers(): void {
  ipcMain.handle('window:get-controls', () => windowControls);
  ipcMain.handle('window:set-scale', (_event, requestedScale: unknown) => {
    if (!mainWindowRef || typeof requestedScale !== 'number') {
      return windowControls.scale;
    }

    return applyWindowScale(mainWindowRef, requestedScale);
  });
  ipcMain.handle('window:set-mouse-passthrough', (_event, enabled: unknown) => {
    if (!mainWindowRef || typeof enabled !== 'boolean') {
      return windowControls.mousePassthrough;
    }

    return applyMousePassthrough(mainWindowRef, enabled);
  });
  ipcMain.handle('window:set-mouse-mode', (_event, mode: unknown) => {
    if (!mainWindowRef || (mode !== 'smart' && mode !== 'interactive')) {
      return windowControls;
    }

    return applyMouseMode(mainWindowRef, mode);
  });
  ipcMain.handle('window:set-mouse-hit-test', (_event, canInteract: unknown) => {
    if (!mainWindowRef || typeof canInteract !== 'boolean') {
      return lastMouseHitCanInteract;
    }

    return applyMouseHitTest(mainWindowRef, canInteract);
  });
  ipcMain.handle('window:set-mouse-hit-regions', (_event, regions: unknown) => {
    setMouseHitRegions(regions);
  });
  ipcMain.handle('window:set-drag-active', (_event, active: unknown) => {
    if (!mainWindowRef || typeof active !== 'boolean') {
      return;
    }

    windowDragActive = active;
    if (active) {
      setWindowMouseIgnore(mainWindowRef, false);
    } else {
      pollMouseHitTest();
    }
  });
  ipcMain.handle('window:move-by', (_event, deltaX: unknown, deltaY: unknown) => {
    if (!mainWindowRef) {
      return;
    }

    const safeDeltaX = numberValue(deltaX);
    const safeDeltaY = numberValue(deltaY);

    if (safeDeltaX === undefined || safeDeltaY === undefined) {
      return;
    }

    const [currentX, currentY] = mainWindowRef.getPosition();
    mainWindowRef.setPosition(currentX + Math.round(safeDeltaX), currentY + Math.round(safeDeltaY), false);
    syncMacInputHitRegions();
  });
}

function isManualRenderSelection(value: unknown): value is ManualRenderSelection {
  return (
    isRecord(value) &&
    typeof value.state === 'string' &&
    COMPANION_STATES.has(value.state) &&
    (value.variant === null || typeof value.variant === 'string') &&
    (value.folder === undefined || value.folder === null || typeof value.folder === 'string') &&
    (value.replayId === undefined || typeof value.replayId === 'number')
  );
}

function publishManualRenderSelection(): void {
  sendToRendererWindows(MANUAL_RENDER_SELECTION_CHANNEL, manualRenderSelection);
}

function publishInteractionDragActive(active: boolean): void {
  sendToRendererWindows(INTERACTION_DRAG_ACTIVE_CHANNEL, active);
}

function registerManualRenderHandlers(): void {
  ipcMain.handle('render:get-manual-selection', () => manualRenderSelection);
  ipcMain.handle('render:set-manual-selection', (_event, selection: unknown) => {
    if (!isManualRenderSelection(selection)) {
      throw new Error('Invalid render selection.');
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

function nowIso(): string {
  return new Date().toISOString();
}

function ttlFromUnknown(value: unknown): number {
  const requestedTtl = numberValue(value);
  if (requestedTtl === undefined) {
    return companionProtocolConfig.defaultTtlMs;
  }
  return Math.min(Math.max(0, Math.round(requestedTtl)), companionProtocolConfig.maxTtlMs);
}

function confirmationTtlFromUnknown(value: unknown): number {
  const requestedTtl = numberValue(value);
  if (requestedTtl === undefined) {
    return CONFIRMATION_DEFAULT_TTL_MS;
  }
  return Math.min(Math.max(1000, Math.round(requestedTtl)), CONFIRMATION_MAX_TTL_MS);
}

function publishAgentRuntimeState(nextState: AgentRenderState | null): void {
  const payload = JSON.stringify(nextState);
  if (payload === agentRuntimeLastPayload) {
    return;
  }

  agentRuntimeState = nextState;
  agentRuntimeLastPayload = payload;
  sendToRendererWindows(AGENT_RUNTIME_STATE_CHANNEL, nextState);
  publishCompanionProtocolStatus();
}

function clearAgentRuntimeTimer(): void {
  if (agentRuntimeTimer) {
    clearTimeout(agentRuntimeTimer);
    agentRuntimeTimer = null;
  }
}

function setAgentRuntimeState(
  state: AgentRenderState['state'],
  status: AgentRenderState['status'],
  reaction: string | null,
  message: string | null,
  ttlMs: number
): AgentRenderState | null {
  clearAgentRuntimeTimer();

  if (state === 'idle' || ttlMs === 0) {
    publishAgentRuntimeState(null);
    return null;
  }

  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const nextState: AgentRenderState = {
    source: 'agent',
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

function publishAgentConfirmation(): void {
  sendToRendererWindows(AGENT_CONFIRMATION_CHANNEL, agentConfirmation);
  publishCompanionProtocolStatus();
}

function clearAgentConfirmationTimer(): void {
  if (agentConfirmationTimer) {
    clearTimeout(agentConfirmationTimer);
    agentConfirmationTimer = null;
  }
}

function completeAgentConfirmation(
  status: Exclude<AgentConfirmation['status'], 'pending'>,
  resolvedBy: AgentConfirmation['resolvedBy']
): AgentConfirmation {
  if (!agentConfirmation || agentConfirmation.status !== 'pending') {
    throw new Error('no pending confirmation request');
  }

  clearAgentConfirmationTimer();
  agentConfirmation = {
    ...agentConfirmation,
    status,
    respondedAt: nowIso(),
    resolvedBy
  };
  recordCompanionActivity('confirmation_result', `confirmation ${status}`, {
    requestId: agentConfirmation.requestId,
    status,
    resolvedBy
  });
  publishAgentConfirmation();

  if (status === 'allowed') {
    setAgentRuntimeState('success', 'done', null, '已允许', CONFIRMATION_FEEDBACK_TTL_MS);
  } else if (status === 'denied') {
    setAgentRuntimeState('error', 'blocked', null, '已拒绝', CONFIRMATION_FEEDBACK_TTL_MS);
  } else {
    clearAgentRuntimeTimer();
    publishAgentRuntimeState(null);
  }

  return agentConfirmation;
}

function expireAgentConfirmation(): void {
  if (!agentConfirmation || agentConfirmation.status !== 'pending') {
    return;
  }
  completeAgentConfirmation('expired', 'timeout');
}

function createAgentConfirmation(params: Record<string, unknown>): AgentConfirmation {
  if (agentConfirmation?.status === 'pending') {
    throw new Error('confirmation request already pending');
  }

  const titleValidation = validateAgentMessage(params.title, {
    maxChars: companionProtocolConfig.messageMaxChars
  });
  if (!titleValidation.ok) {
    throw new Error(titleValidation.error ?? 'invalid title');
  }

  const messageValidation = validateAgentMessage(params.message, {
    maxChars: companionProtocolConfig.messageMaxChars
  });
  if (!messageValidation.ok) {
    throw new Error(messageValidation.error ?? 'invalid message');
  }

  const ttlMs = confirmationTtlFromUnknown(params.ttlMs);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  agentConfirmation = {
    requestId: `confirm-${Date.now()}-${randomBytes(4).toString('hex')}`,
    status: 'pending',
    title: titleValidation.message ?? '',
    message: messageValidation.message ?? '',
    createdAt,
    expiresAt,
    respondedAt: null,
    resolvedBy: null
  };
  recordCompanionActivity('confirmation_request', agentConfirmation.title, {
    requestId: agentConfirmation.requestId,
    status: agentConfirmation.status
  });
  publishAgentConfirmation();
  setAgentRuntimeState('waiting_auth', 'waiting_auth', null, agentConfirmation.title, ttlMs);
  agentConfirmationTimer = setTimeout(expireAgentConfirmation, ttlMs);
  openControlCenterWindow('integrations').catch((error: unknown) => {
    console.warn('Failed to open control center for confirmation.', error);
  });
  return agentConfirmation;
}

function respondAgentConfirmation(requestId: string, action: AgentConfirmationAction): AgentConfirmation {
  if (!agentConfirmation || agentConfirmation.status !== 'pending') {
    throw new Error('no pending confirmation request');
  }
  if (agentConfirmation.requestId !== requestId) {
    throw new Error('confirmation request id mismatch');
  }

  if (action === 'allow') {
    return completeAgentConfirmation('allowed', 'user');
  }
  if (action === 'deny') {
    return completeAgentConfirmation('denied', 'user');
  }
  if (action === 'cancel') {
    return completeAgentConfirmation('cancelled', 'user');
  }
  throw new Error('unsupported confirmation action');
}

function assertAgentCooldown(): void {
  const elapsedMs = Date.now() - lastAgentMutationAt;
  if (elapsedMs < companionProtocolConfig.cooldownMs) {
    throw new Error(`cooldown active; retry in ${companionProtocolConfig.cooldownMs - elapsedMs}ms`);
  }
  lastAgentMutationAt = Date.now();
}

function companionProtocolStatus(): CompanionProtocolStatus {
  return {
    enabled: companionProtocolConfig.enabled,
    running: Boolean(companionProtocolServer),
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    transport: 'unix-socket',
    socketPath: companionProtocolSocketPath || null,
    discoveryPath: companionProtocolDiscoveryPath || null,
    appVersion: app.getVersion(),
    methods: [...COMPANION_PROTOCOL_METHODS],
    agentState: agentRuntimeState,
    confirmation: agentConfirmation,
    lastError: companionProtocolLastError
  };
}

function publishCompanionProtocolStatus(): void {
  sendToRendererWindows(COMPANION_PROTOCOL_STATUS_CHANNEL, companionProtocolStatus());
}

async function protocolStatusPayload(): Promise<Record<string, unknown>> {
  const profiles = await petProfileState();
  return {
    appVersion: app.getVersion(),
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    transport: 'unix-socket',
    activeProfileId,
    profiles,
    agentState: agentRuntimeState,
    confirmation: agentConfirmation,
    codexState: codexRuntimeState,
    methods: [...COMPANION_PROTOCOL_METHODS]
  };
}

function safeCodexSummary(): Record<string, unknown> | null {
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

function safeAgentSummary(): Record<string, unknown> | null {
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

function safeConfirmationSummary(): Record<string, unknown> | null {
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

async function contextSummaryPayload(): Promise<Record<string, unknown>> {
  const profiles = await petProfileState();
  const profileCapabilitiesSummary = await profileCapabilitiesSummaryPayload(profiles.activeProfileId);
  return {
    appVersion: app.getVersion(),
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
    videoSupply: {
      ledger: 'docs/10_video_supply_progress.md',
      generatedDetail: 'docs/generated/profiles/guofeng_ai/action_progress.md',
      v12BlockedProfile: 'guofeng_ai',
      v12BlockedActions: [...V12_BLOCKED_INTERACTION_ACTIONS],
      completedInteractionActions: ['mouse_hover_look', 'mouse_shy_loop', 'mouse_leave_back', 'drag_hold_lift']
    }
  };
}

function activityListPayload(params: unknown): Record<string, unknown> {
  const limit = activityLimitFromParams(params);
  return {
    activities: limit === 0 ? [] : companionActivities.slice(-limit)
  };
}

async function handleCompanionProtocolMethod(method: string, params: unknown): Promise<unknown> {
  if (method === 'companion.status') {
    return protocolStatusPayload();
  }

  if (method === 'companion.react') {
    if (!isRecord(params)) {
      throw new Error('params must be an object');
    }
    const reaction = stringValue(params.reaction);
    if (!reaction) {
      throw new Error('reaction is required');
    }
    const state = mapAgentReaction(reaction);
    if (!state) {
      throw new Error(`unsupported reaction: ${reaction}`);
    }
    assertAgentCooldown();
    const nextState = setAgentRuntimeState(state, null, reaction.trim().toLowerCase(), null, ttlFromUnknown(params.ttlMs));
    recordCompanionActivity('react', `reaction: ${reaction.trim().toLowerCase()}`, {
      reaction: reaction.trim().toLowerCase(),
      state
    });
    return { state, reaction: reaction.trim().toLowerCase(), agentState: nextState };
  }

  if (method === 'companion.say') {
    if (!isRecord(params)) {
      throw new Error('params must be an object');
    }
    const validation = validateAgentMessage(params.message, {
      maxChars: companionProtocolConfig.messageMaxChars
    });
    if (!validation.ok) {
      throw new Error(validation.error ?? 'invalid message');
    }

    let reaction: string | null = null;
    let state: AgentRenderState['state'] = 'reminder';
    if (params.reaction !== undefined) {
      reaction = stringValue(params.reaction) ?? null;
      if (!reaction) {
        throw new Error('reaction must be a string');
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
    recordCompanionActivity('say', validation.message ?? 'message shown', {
      state,
      reaction: reaction ? reaction.trim().toLowerCase() : null
    });
    return { state, message: validation.message, agentState: nextState };
  }

  if (method === 'companion.agent.set_state') {
    if (!isRecord(params)) {
      throw new Error('params must be an object');
    }
    const status = stringValue(params.status);
    if (!status) {
      throw new Error('status is required');
    }
    const normalizedStatus = normalizeAgentStatus(status);
    const state = mapAgentStatus(status);
    if (!normalizedStatus || !state) {
      throw new Error(`unsupported agent status: ${status}`);
    }

    let message: string | null = null;
    if (params.message !== undefined) {
      const validation = validateAgentMessage(params.message, {
        maxChars: companionProtocolConfig.messageMaxChars
      });
      if (!validation.ok) {
        throw new Error(validation.error ?? 'invalid message');
      }
      message = validation.message ?? null;
    }

    if (state === 'idle') {
      clearAgentRuntimeTimer();
      publishAgentRuntimeState(null);
      recordCompanionActivity('agent_clear', 'agent state cleared', {
        status: normalizedStatus
      });
      return { status: normalizedStatus, state, agentState: null };
    }

    assertAgentCooldown();
    const nextState = setAgentRuntimeState(state, normalizedStatus, null, message, ttlFromUnknown(params.ttlMs));
    recordCompanionActivity('agent_state', `agent ${normalizedStatus}`, {
      status: normalizedStatus,
      state
    });
    return { status: normalizedStatus, state, message, agentState: nextState };
  }

  if (method === 'companion.agent.get_state') {
    return { agentState: agentRuntimeState };
  }

  if (method === 'companion.agent.clear_state') {
    clearAgentRuntimeTimer();
    publishAgentRuntimeState(null);
    recordCompanionActivity('agent_clear', 'agent state cleared', {
      status: null
    });
    return { agentState: null };
  }

  if (method === 'companion.confirm.request') {
    if (!isRecord(params)) {
      throw new Error('params must be an object');
    }
    return createAgentConfirmation(params);
  }

  if (method === 'companion.confirm.get') {
    return { confirmation: agentConfirmation };
  }

  if (method === 'companion.confirm.cancel') {
    return completeAgentConfirmation('cancelled', 'agent');
  }

  if (method === 'companion.context.summary') {
    return contextSummaryPayload();
  }

  if (method === 'companion.activity.list') {
    return activityListPayload(params);
  }

  if (method === 'companion.profile.list') {
    return petProfileState();
  }

  if (method === 'companion.profile.capabilities') {
    return profileCapabilitiesPayload(params);
  }

  if (method === 'companion.profile.select') {
    if (!isRecord(params)) {
      throw new Error('params must be an object');
    }
    const profileId = stringValue(params.profileId);
    if (!profileId) {
      throw new Error('profileId is required');
    }
    return selectPetProfile(profileId);
  }

  throw new Error(`unknown method: ${method}`);
}

function protocolResponse(id: unknown, ok: true, result: unknown): string;
function protocolResponse(id: unknown, ok: false, error: string): string;
function protocolResponse(id: unknown, ok: boolean, payload: unknown): string {
  return `${JSON.stringify(ok ? { id, ok, result: payload } : { id, ok, error: payload })}\n`;
}

async function handleProtocolRequest(rawLine: string, socket: Socket): Promise<void> {
  let request: unknown;
  try {
    request = JSON.parse(rawLine);
  } catch {
    recordCompanionActivity('protocol_error', 'invalid JSON', {
      method: null
    });
    socket.write(protocolResponse(null, false, 'invalid JSON'));
    return;
  }

  if (!isRecord(request)) {
    recordCompanionActivity('protocol_error', 'request must be an object', {
      method: null
    });
    socket.write(protocolResponse(null, false, 'request must be an object'));
    return;
  }

  const id = request.id ?? null;
  const method = stringValue(request.method);
  if (request.token !== companionProtocolToken) {
    recordCompanionActivity('protocol_error', 'unauthorized', {
      method: method ?? null
    });
    socket.write(protocolResponse(id, false, 'unauthorized'));
    return;
  }
  if (!method) {
    recordCompanionActivity('protocol_error', 'method is required', {
      method: null
    });
    socket.write(protocolResponse(id, false, 'method is required'));
    return;
  }

  try {
    const result = await handleCompanionProtocolMethod(method, request.params);
    socket.write(protocolResponse(id, true, result));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed';
    recordCompanionActivity('protocol_error', message, {
      method
    });
    socket.write(protocolResponse(id, false, message));
  }
}

function handleProtocolSocket(socket: Socket): void {
  socket.setEncoding('utf8');
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        handleProtocolRequest(trimmedLine, socket).catch((error: unknown) => {
          socket.write(protocolResponse(null, false, error instanceof Error ? error.message : 'request failed'));
        });
      }
    }
  });
}

async function cleanupCompanionProtocolFiles(): Promise<void> {
  await Promise.all([
    companionProtocolSocketPath ? rm(companionProtocolSocketPath, { force: true }) : Promise.resolve(),
    companionProtocolDiscoveryPath ? rm(companionProtocolDiscoveryPath, { force: true }) : Promise.resolve()
  ]);
}

async function writeCompanionProtocolDiscovery(): Promise<void> {
  const discovery = {
    appName: 'Desktop AI Companion',
    appVersion: app.getVersion(),
    protocolVersion: COMPANION_PROTOCOL_VERSION,
    pid: process.pid,
    transport: 'unix-socket',
    socketPath: companionProtocolSocketPath,
    token: companionProtocolToken,
    methods: [...COMPANION_PROTOCOL_METHODS],
    createdAt: nowIso()
  };
  await mkdir(dirname(companionProtocolDiscoveryPath), { recursive: true });
  await writeFile(companionProtocolDiscoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, 'utf8');
}

async function startCompanionProtocolService(): Promise<void> {
  companionProtocolConfig = await loadCompanionProtocolConfig();
  companionProtocolSocketPath = resolveRuntimePath(companionProtocolConfig.socketPath);
  companionProtocolDiscoveryPath = resolveRuntimePath(companionProtocolConfig.discoveryPath);
  companionProtocolLastError = null;

  if (!companionProtocolConfig.enabled) {
    publishCompanionProtocolStatus();
    return;
  }

  companionProtocolToken = randomBytes(24).toString('hex');
  await mkdir(dirname(companionProtocolSocketPath), { recursive: true });
  await mkdir(dirname(companionProtocolDiscoveryPath), { recursive: true });
  await rm(companionProtocolSocketPath, { force: true });

  companionProtocolServer = createServer(handleProtocolSocket);
  companionProtocolServer.on('error', (error) => {
    companionProtocolLastError = error instanceof Error ? error.message : 'protocol server error';
    publishCompanionProtocolStatus();
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    companionProtocolServer?.once('error', rejectPromise);
    companionProtocolServer?.listen(companionProtocolSocketPath, () => {
      companionProtocolServer?.off('error', rejectPromise);
      resolvePromise();
    });
  });

  await writeCompanionProtocolDiscovery();
  publishCompanionProtocolStatus();
}

async function stopCompanionProtocolService(): Promise<void> {
  clearAgentRuntimeTimer();
  publishAgentRuntimeState(null);
  const server = companionProtocolServer;
  companionProtocolServer = null;

  await new Promise<void>((resolvePromise) => {
    if (!server) {
      resolvePromise();
      return;
    }
    server.close(() => resolvePromise());
  });
  await cleanupCompanionProtocolFiles();
  publishCompanionProtocolStatus();
}

function stopCompanionProtocolServiceSync(): void {
  clearAgentRuntimeTimer();
  companionProtocolServer?.close();
  companionProtocolServer = null;
  if (companionProtocolSocketPath) {
    rmSync(companionProtocolSocketPath, { force: true });
  }
  if (companionProtocolDiscoveryPath) {
    rmSync(companionProtocolDiscoveryPath, { force: true });
  }
}

function publishShortcutsUpdated(): void {
  sendToRendererWindows(SHORTCUTS_UPDATED_CHANNEL, shortcutService?.list() ?? []);
}

function publishInputPermissionStatus(status: InputPermissionStatus): void {
  macInputPermissionStatus = status;
  sendToRendererWindows(INPUT_PERMISSION_STATUS_CHANNEL, status);
}

function controlCenterModuleFromUnknown(value: unknown): ControlCenterModule {
  return value === 'tasks' || value === 'reminders' || value === 'settings' || value === 'integrations' || value === 'status'
    ? value
    : 'status';
}

function controlCenterUrl(module: ControlCenterModule): string {
  return process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}?window=control-center&module=${module}`
    : pathToFileURL(join(__dirname, '../renderer/index.html')).toString() + `?window=control-center&module=${module}`;
}

function fitControlCenterBounds(anchor: Electron.Point): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(anchor);
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

async function createControlCenterWindow(module: ControlCenterModule): Promise<BrowserWindow> {
  const controlCenterWindow = new BrowserWindow({
    width: CONTROL_CENTER_WIDTH,
    height: CONTROL_CENTER_HEIGHT,
    minWidth: CONTROL_CENTER_WIDTH,
    minHeight: CONTROL_CENTER_HEIGHT,
    maxWidth: CONTROL_CENTER_WIDTH,
    maxHeight: CONTROL_CENTER_HEIGHT,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#fbf7f0',
    hasShadow: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Desktop AI Companion Control Center',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  controlCenterWindowRef = controlCenterWindow;
  controlCenterWindow.setFullScreenable(false);
  controlCenterWindow.setAlwaysOnTop(true, 'floating');
  controlCenterWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      closeControlCenterWindow();
    }
  });
  controlCenterWindow.on('blur', () => {
    closeControlCenterWindow();
  });
  controlCenterWindow.on('closed', () => {
    if (controlCenterWindowRef === controlCenterWindow) {
      controlCenterWindowRef = null;
    }
  });

  await controlCenterWindow.loadURL(controlCenterUrl(module));
  return controlCenterWindow;
}

async function openControlCenterWindow(module: ControlCenterModule = 'status', anchor = screen.getCursorScreenPoint()): Promise<void> {
  let controlCenterWindow = controlCenterWindowRef;

  if (!controlCenterWindow || controlCenterWindow.isDestroyed()) {
    controlCenterWindow = await createControlCenterWindow(module);
  }

  controlCenterWindow.setBounds(fitControlCenterBounds(anchor), false);
  controlCenterWindow.webContents.send(CONTROL_CENTER_MODULE_CHANNEL, module);
  controlCenterWindow.show();
  controlCenterWindow.focus();
}

function closeControlCenterWindow(): void {
  const controlCenterWindow = controlCenterWindowRef;
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
    controlCenterWindow.hide();
  }
}

async function toggleControlCenterWindow(module: ControlCenterModule = 'status'): Promise<void> {
  const controlCenterWindow = controlCenterWindowRef;
  if (controlCenterWindow && !controlCenterWindow.isDestroyed() && controlCenterWindow.isVisible()) {
    closeControlCenterWindow();
    return;
  }

  await openControlCenterWindow(module);
}

function shortcutActions(): Map<string, () => void> {
  return new Map([
    [
      'control-center.toggle',
      () => {
        toggleControlCenterWindow('status').catch((error: unknown) => {
          console.warn('Failed to toggle control center.', error);
        });
      }
    ],
    ...(['control-center.status', 'control-center.reminders', 'control-center.tasks', 'control-center.settings'] as const).map(
      (id) =>
        [
          id,
          () => {
            const module = moduleForShortcutId(id) ?? 'status';
            openControlCenterWindow(module).catch((error: unknown) => {
              console.warn('Failed to open control center.', error);
            });
          }
        ] as const
    )
  ]);
}

function registerShortcuts(): void {
  shortcutService?.register(shortcutActions());
}

async function reloadShortcutsAfterUpdate(shortcuts: ShortcutBinding[]): Promise<ShortcutBinding[]> {
  shortcutService?.unregister();
  registerShortcuts();
  macInputService?.updateModifier(shortcutService?.interactionModifier() ?? 'Option');
  publishShortcutsUpdated();
  return shortcuts;
}

function registerShortcutHandlers(): void {
  ipcMain.handle('shortcuts:list', () => shortcutService?.list() ?? []);
  ipcMain.handle('shortcuts:update', async (_event, id: unknown, accelerator: unknown) => {
    if (!shortcutService || typeof id !== 'string' || typeof accelerator !== 'string') {
      throw new Error('Invalid shortcut update.');
    }

    return reloadShortcutsAfterUpdate(await shortcutService.updateShortcut(id, accelerator));
  });
  ipcMain.handle('shortcuts:reset', async (_event, id: unknown) => {
    if (!shortcutService || typeof id !== 'string') {
      throw new Error('Invalid shortcut reset.');
    }

    return reloadShortcutsAfterUpdate(await shortcutService.resetShortcut(id));
  });
  ipcMain.handle('input-permission:get-status', () => macInputPermissionStatus);
  ipcMain.handle('input-permission:open-settings', async () => {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  });
  ipcMain.handle('control-center:open', async (_event, module: unknown) => {
    await openControlCenterWindow(controlCenterModuleFromUnknown(module));
  });
  ipcMain.handle('control-center:close', () => {
    closeControlCenterWindow();
  });
}

function handleMacInputEvent(event: { type: string; x?: number; y?: number }): void {
  const mainWindow = mainWindowRef;
  if (!mainWindow || mainWindow.isDestroyed() || typeof event.x !== 'number' || typeof event.y !== 'number') {
    return;
  }

  if (event.type === 'leftDown') {
    macInputDragPoint = { x: event.x, y: event.y };
    macInputDragging = false;
    return;
  }

  if (event.type === 'leftDragged' && macInputDragPoint) {
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

  if (event.type === 'leftUp') {
    macInputDragPoint = null;
    if (macInputDragging) {
      macInputDragging = false;
      publishInteractionDragActive(false);
    }
    return;
  }

  if (event.type === 'rightDown') {
    openControlCenterWindow('status', { x: Math.round(event.x), y: Math.round(event.y) }).catch((error: unknown) => {
      console.warn('Failed to open control center from mouse shortcut.', error);
    });
  }
}

function startMacInputService(): void {
  macInputService = new MacInputService(
    resolveProjectPath('app', 'electron', 'macos-input-helper.swift'),
    handleMacInputEvent,
    publishInputPermissionStatus
  );
  macInputService.start(shortcutService?.interactionModifier() ?? 'Option');
}

function parseCodexRuntimeState(raw: unknown): CodexRuntimeState | null {
  if (!isRecord(raw)) {
    return null;
  }

  const state = stringValue(raw.state);
  const timestamp = stringValue(raw.timestamp);

  if (raw.source !== 'codex' || !state || !CODEX_RUNTIME_STATES.has(state as CodexRuntimeStatus) || !timestamp) {
    return null;
  }

  const exitCode = numberValue(raw.exitCode);

  return {
    source: 'codex',
    state: state as CodexRuntimeStatus,
    message: stringValue(raw.message),
    task: stringValue(raw.task),
    event: stringValue(raw.event),
    cwd: stringValue(raw.cwd),
    toolName: stringValue(raw.toolName),
    exitCode: exitCode === undefined ? undefined : exitCode,
    timestamp,
    expiresAt: stringValue(raw.expiresAt)
  };
}

function idleCodexRenderState(raw: CodexRuntimeState | null, isStale: boolean): CodexRenderState {
  return {
    source: 'codex',
    state: 'idle',
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

function normalizeCodexRuntimeState(raw: CodexRuntimeState, now = Date.now()): CodexRenderState {
  const expiresAtMs = timestampMs(raw.expiresAt);

  if (expiresAtMs !== null && expiresAtMs <= now) {
    return idleCodexRenderState(raw, true);
  }

  const rawTimestampMs = timestampMs(raw.timestamp);

  if (
    raw.state === 'success' &&
    rawTimestampMs !== null &&
    !raw.expiresAt &&
    rawTimestampMs + codexPluginConfig.successHoldMs <= now
  ) {
    return idleCodexRenderState(raw, true);
  }

  if (
    raw.state === 'error' &&
    rawTimestampMs !== null &&
    !raw.expiresAt &&
    rawTimestampMs + codexPluginConfig.errorHoldMs <= now
  ) {
    return idleCodexRenderState(raw, true);
  }

  const state =
    raw.state === 'coding' &&
    rawTimestampMs !== null &&
    rawTimestampMs + codexPluginConfig.thinkingTimeoutMs <= now
      ? 'thinking'
      : raw.state;

  return {
    source: 'codex',
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

function publishCodexRuntimeState(nextState: CodexRenderState | null): void {
  const payload = JSON.stringify(nextState);

  if (payload === codexRuntimeLastPayload) {
    return;
  }

  codexRuntimeState = nextState;
  codexRuntimeLastPayload = payload;

  sendToRendererWindows(CODEX_RUNTIME_STATE_CHANNEL, nextState);

  syncTaskFromCodexState(nextState);
}

async function readAndPublishCodexRuntimeState(): Promise<void> {
  if (!codexPluginConfig.enabled || !codexRuntimePath) {
    publishCodexRuntimeState(null);
    return;
  }

  try {
    const raw = await readFile(codexRuntimePath, 'utf8');
    const parsed = parseCodexRuntimeState(JSON.parse(raw));

    if (!parsed) {
      console.warn(`Invalid Codex runtime state ignored: ${codexRuntimePath}`);
      return;
    }

    publishCodexRuntimeState(normalizeCodexRuntimeState(parsed));
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      publishCodexRuntimeState(null);
      return;
    }

    console.warn(`Failed to read Codex runtime state: ${codexRuntimePath}`, error);
  }
}

function registerCodexRuntimeHandlers(): void {
  ipcMain.handle('codex:get-runtime-state', () => codexRuntimeState);
}

function registerCompanionProtocolHandlers(): void {
  ipcMain.handle('agent:get-runtime-state', () => agentRuntimeState);
  ipcMain.handle('agent:get-confirmation', () => agentConfirmation);
  ipcMain.handle('agent:respond-confirmation', (_event, requestId: unknown, action: unknown) => {
    if (typeof requestId !== 'string') {
      throw new Error('confirmation request id is required');
    }
    if (action !== 'allow' && action !== 'deny' && action !== 'cancel') {
      throw new Error('unsupported confirmation action');
    }
    return respondAgentConfirmation(requestId, action);
  });
  ipcMain.handle('companion-protocol:get-status', () => companionProtocolStatus());
}

async function startCodexRuntimeService(): Promise<void> {
  codexPluginConfig = await loadCodexPluginConfig();
  codexRuntimePath = resolveRuntimePath(codexPluginConfig.runtimeStatePath);

  if (!codexPluginConfig.enabled) {
    publishCodexRuntimeState(null);
    return;
  }

  const runtimeDirectory = dirname(codexRuntimePath);
  await mkdir(runtimeDirectory, { recursive: true });
  await readAndPublishCodexRuntimeState();

  codexRuntimeWatcher?.close();
  codexRuntimeWatcher = watch(runtimeDirectory, { persistent: false }, () => {
    readAndPublishCodexRuntimeState().catch((error: unknown) => {
      console.warn('Failed to refresh Codex runtime state after fs event.', error);
    });
  });

  if (codexRuntimePollTimer) {
    clearInterval(codexRuntimePollTimer);
  }

  codexRuntimePollTimer = setInterval(() => {
    readAndPublishCodexRuntimeState().catch((error: unknown) => {
      console.warn('Failed to poll Codex runtime state.', error);
    });
  }, Math.max(250, codexPluginConfig.pollIntervalMs));
  codexRuntimePollTimer.unref();
}

function publishReminderRuntimeState(nextState: ReminderNotification | null): void {
  const payload = JSON.stringify(nextState);

  if (payload === reminderRuntimeLastPayload) {
    return;
  }

  reminderRuntimeState = nextState;
  reminderRuntimeLastPayload = payload;

  sendToRendererWindows(REMINDER_RUNTIME_STATE_CHANNEL, nextState);
}

function publishRemindersUpdated(): void {
  const reminders = reminderService?.listReminders() ?? [];

  sendToRendererWindows(REMINDERS_UPDATED_CHANNEL, reminders);
}

function currentReminderService(): ReminderService {
  if (!reminderService) {
    throw new Error('Reminder service is not ready.');
  }

  return reminderService;
}

function numberId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function reminderInputFromUnknown(value: unknown): CreateReminderInput {
  if (!isRecord(value)) {
    throw new Error('Reminder input is invalid.');
  }

  const title = stringValue(value.title);
  const dueAt = stringValue(value.dueAt);

  if (!title || !dueAt) {
    throw new Error('Reminder title and dueAt are required.');
  }

  return {
    title,
    dueAt,
    repeatRule: stringValue(value.repeatRule) as CreateReminderInput['repeatRule'],
    priority: stringValue(value.priority) as CreateReminderInput['priority']
  };
}

function registerReminderHandlers(): void {
  ipcMain.handle('reminders:get-runtime-state', () => reminderRuntimeState);
  ipcMain.handle('reminders:list', () => reminderService?.listReminders() ?? []);
  ipcMain.handle('reminders:create', (_event, input: unknown) => {
    const reminder = currentReminderService().createReminder(reminderInputFromUnknown(input));
    publishRemindersUpdated();
    return reminder;
  });
  ipcMain.handle('reminders:dismiss', (_event, idValue: unknown) => {
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
  ipcMain.handle('reminders:dismiss-notification', (_event, idValue: unknown) => {
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
  ipcMain.handle('reminders:snooze', (_event, idValue: unknown, minutesValue: unknown) => {
    const id = numberId(idValue);
    const minutes = typeof minutesValue === 'number' && Number.isFinite(minutesValue) ? minutesValue : null;
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

function pollDueReminders(): void {
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

async function startReminderService(): Promise<void> {
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

function createQuickReminderFromMenu(minutes: number): void {
  const reminder = reminderService?.createQuickReminder(minutes);
  if (!reminder) {
    return;
  }

  publishRemindersUpdated();
}

function registerReminderContextMenu(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on('context-menu', () => {
    if (!reminderService?.enabled && !taskService?.enabled) {
      return;
    }

    const template: MenuItemConstructorOptions[] = [];

    if (reminderService?.enabled) {
      template.push(
        ...reminderService.quickCreateMinutes.map((minutes) => ({
          label: `${minutes} 分钟后提醒`,
          click: () => createQuickReminderFromMenu(minutes)
        })),
        { type: 'separator' },
        {
          label: '提醒面板',
          click: () => {
            openControlCenterWindow('reminders').catch((error: unknown) => {
              console.warn('Failed to open reminders from menu.', error);
            });
          }
        }
      );
    }

    if (taskService?.enabled) {
      if (template.length > 0) {
        template.push({ type: 'separator' });
      }
      template.push({
        label: '任务中心',
        click: () => {
          openControlCenterWindow('tasks').catch((error: unknown) => {
            console.warn('Failed to open tasks from menu.', error);
          });
        }
      });
    }

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

function publishTaskNotification(nextNotification: TaskNotification | null): void {
  const payload = JSON.stringify(nextNotification);

  if (payload === taskNotificationLastPayload) {
    return;
  }

  taskNotification = nextNotification;
  taskNotificationLastPayload = payload;

  sendToRendererWindows(TASK_NOTIFICATION_CHANNEL, nextNotification);
}

function taskSnapshot(): TaskCenterSnapshot {
  return (
    taskService?.snapshot() ?? {
      today: [],
      currentCodex: null,
      recentCompleted: []
    }
  );
}

function publishTasksUpdated(): void {
  const tasks = taskSnapshot();

  sendToRendererWindows(TASKS_UPDATED_CHANNEL, tasks);
}

function currentTaskService(): TaskService {
  if (!taskService) {
    throw new Error('Task service is not ready.');
  }

  return taskService;
}

function taskInputFromUnknown(value: unknown): CreateTaskInput {
  if (!isRecord(value)) {
    throw new Error('Task input is invalid.');
  }

  const title = stringValue(value.title);
  if (!title) {
    throw new Error('Task title is required.');
  }

  return {
    title,
    taskDate: stringValue(value.taskDate)
  };
}

function taskStatusFromUnknown(value: unknown): TaskStatus | null {
  return value === 'todo' || value === 'active' || value === 'blocked' || value === 'done' || value === 'failed'
    ? value
    : null;
}

function registerTaskHandlers(): void {
  ipcMain.handle('tasks:list', () => taskSnapshot());
  ipcMain.handle('tasks:get-notification', () => taskNotification);
  ipcMain.handle('tasks:create', (_event, input: unknown) => {
    const task = currentTaskService().createTask(taskInputFromUnknown(input));
    publishTasksUpdated();
    return task;
  });
  ipcMain.handle('tasks:update-status', (_event, idValue: unknown, statusValue: unknown) => {
    const id = numberId(idValue);
    const status = taskStatusFromUnknown(statusValue);
    if (!id || !status) {
      return null;
    }

    const task = currentTaskService().updateTaskStatus(id, status);
    if (taskNotification?.task.id === id && status !== 'blocked') {
      publishTaskNotification(null);
    }
    publishTasksUpdated();
    return task;
  });
  ipcMain.handle('tasks:delete', (_event, idValue: unknown) => {
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
  ipcMain.handle('tasks:dismiss-notification', (_event, idValue: unknown) => {
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

function syncTaskFromCodexState(nextState: CodexRenderState | null): void {
  const task = taskService?.handleCodexState(nextState) ?? null;

  if (!task) {
    return;
  }

  if (taskNotification?.task.id === task.id && task.status !== 'blocked') {
    publishTaskNotification(null);
  }
  publishTasksUpdated();
}

function pollStuckTasks(): void {
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

async function startTaskService(): Promise<void> {
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

function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    const rawRelativePath = decodeURIComponent(`${requestUrl.hostname}${requestUrl.pathname}`);
    const relativePath = normalize(rawRelativePath).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^(\/|\\)+/, '');
    const absolutePath = resolve(projectRoot, relativePath);
    const pathFromRoot = relative(projectRoot, absolutePath);

    if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
      return new Response('Invalid asset path', { status: 400 });
    }
    if (!existsSync(absolutePath)) {
      console.warn(`Asset not found: ${relativePath} -> ${absolutePath}`);
      return new Response('Asset not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(absolutePath).toString());
  });
}

function companionCommandFromInput(input: Electron.Input): CompanionCommand | null {
  if (input.type !== 'keyDown') {
    return null;
  }

  switch (input.key) {
    case 'ArrowRight':
      return 'next-state';
    case 'ArrowLeft':
      return 'previous-state';
    case 'Escape':
      return 'reset-idle';
    case '+':
    case '=':
      return 'scale-up';
    case '-':
    case '_':
      return 'scale-down';
    case '0':
      return 'scale-reset';
    default:
      return null;
  }
}

function sendCompanionCommand(mainWindow: BrowserWindow, command: CompanionCommand): void {
  mainWindow.webContents.send(COMPANION_COMMAND_CHANNEL, command);
}

function registerKeyboardCommands(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const command = companionCommandFromInput(input);

    if (!command) {
      return;
    }

    event.preventDefault();
    sendCompanionCommand(mainWindow, command);
  });
}

async function createMainWindow(): Promise<BrowserWindow> {
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
  const mainWindow = new BrowserWindow({
    width: initialWindowSize.width,
    height: initialWindowSize.height,
    minWidth: initialWindowSize.width,
    minHeight: initialWindowSize.height,
    maxWidth: initialWindowSize.width,
    maxHeight: initialWindowSize.height,
    resizable: false,
    frame: false,
    transparent: companionConfig.window.transparent,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    focusable: false,
    alwaysOnTop: companionConfig.window.alwaysOnTop,
    title: 'Desktop AI Companion',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindowRef = mainWindow;

  Menu.setApplicationMenu(null);
  mainWindow.setFullScreenable(false);
  mainWindow.setAlwaysOnTop(companionConfig.window.alwaysOnTop, 'floating');
  setWindowMouseIgnore(mainWindow, true);

  mainWindow.once('ready-to-show', () => {
    mainWindow.showInactive();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    setWindowMouseIgnore(mainWindow, true);
    syncMacInputHitRegions();
  });

  registerKeyboardCommands(mainWindow);
  registerReminderContextMenu(mainWindow);

  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null;
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(async () => {
  await loadSelectedProfile();
  registerConfigHandlers();
  registerPetProfileHandlers();
  registerWindowControlHandlers();
  registerManualRenderHandlers();
  registerShortcutHandlers();
  registerCodexRuntimeHandlers();
  registerCompanionProtocolHandlers();
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
  registerShortcuts();
  startMacInputService();
  syncMacInputHitRegions();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
      syncMacInputHitRegions();
    }
  });
});

app.on('will-quit', () => {
  shortcutService?.unregister();
  macInputService?.stop();
  codexRuntimeWatcher?.close();
  if (codexRuntimePollTimer) {
    clearInterval(codexRuntimePollTimer);
  }
  stopCompanionProtocolServiceSync();
  if (reminderPollTimer) {
    clearInterval(reminderPollTimer);
  }
  reminderService?.close();
  if (taskPollTimer) {
    clearInterval(taskPollTimer);
  }
  taskService?.close();
  if (mouseHitTestPollTimer) {
    clearInterval(mouseHitTestPollTimer);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
