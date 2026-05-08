import { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, shell } from 'electron';
import type { MenuItemConstructorOptions, Rectangle } from 'electron';
import { existsSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  CodexPluginConfig,
  CodexRenderState,
  CodexRuntimeState,
  CodexRuntimeStatus,
  CompanionCommand,
  CompanionConfig,
  ControlCenterModule,
  CreateReminderInput,
  CreateTaskInput,
  InputPermissionStatus,
  ManualRenderSelection,
  PluginsConfig,
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
const REMINDER_RUNTIME_STATE_CHANNEL = 'reminder:runtime-state';
const REMINDERS_UPDATED_CHANNEL = 'reminder:updated';
const TASK_NOTIFICATION_CHANNEL = 'task:notification';
const TASKS_UPDATED_CHANNEL = 'task:updated';
const MOUSE_HIT_TEST_SAMPLE_CHANNEL = 'mouse:hit-test-sample';
const MANUAL_RENDER_SELECTION_CHANNEL = 'render:manual-selection';
const CONTROL_CENTER_MODULE_CHANNEL = 'control-center:module';
const SHORTCUTS_UPDATED_CHANNEL = 'shortcuts:updated';
const INPUT_PERMISSION_STATUS_CHANNEL = 'input-permission:status';
const MAX_MOUSE_HIT_REGIONS = 2400;
const CONTROL_CENTER_WIDTH = 420;
const CONTROL_CENTER_HEIGHT = 560;
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
  'coding',
  'thinking',
  'waiting_auth',
  'success',
  'error',
  'reminder',
  'sleep'
]);

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

function registerConfigHandlers(): void {
  ipcMain.handle('config:get-companion', () =>
    readJsonFile<CompanionConfig>('data', 'config', 'companion.config.json')
  );
  ipcMain.handle('config:get-states', () =>
    readJsonFile<StatesConfig>('data', 'config', 'states.config.json')
  );
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
    (value.variant === null || typeof value.variant === 'string')
  );
}

function publishManualRenderSelection(): void {
  sendToRendererWindows(MANUAL_RENDER_SELECTION_CHANNEL, manualRenderSelection);
}

function registerManualRenderHandlers(): void {
  ipcMain.handle('render:get-manual-selection', () => manualRenderSelection);
  ipcMain.handle('render:set-manual-selection', (_event, selection: unknown) => {
    if (!isManualRenderSelection(selection)) {
      throw new Error('Invalid render selection.');
    }

    manualRenderSelection = {
      state: selection.state,
      variant: selection.variant
    };
    publishManualRenderSelection();
    return manualRenderSelection;
  });
}

function publishShortcutsUpdated(): void {
  sendToRendererWindows(SHORTCUTS_UPDATED_CHANNEL, shortcutService?.list() ?? []);
}

function publishInputPermissionStatus(status: InputPermissionStatus): void {
  macInputPermissionStatus = status;
  sendToRendererWindows(INPUT_PERMISSION_STATUS_CHANNEL, status);
}

function controlCenterModuleFromUnknown(value: unknown): ControlCenterModule {
  return value === 'tasks' || value === 'reminders' || value === 'settings' || value === 'status' ? value : 'status';
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
    return;
  }

  if (event.type === 'leftDragged' && macInputDragPoint) {
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
  const companionConfig = await readJsonFile<CompanionConfig>('data', 'config', 'companion.config.json');
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
  registerConfigHandlers();
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
