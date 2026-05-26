export interface CompanionConfig {
  window: {
    alwaysOnTop: boolean;
    transparent: boolean;
    draggable: boolean;
  };
  renderer: {
    defaultState: string;
    assetRoot: string;
    keyframeRoot?: string;
    webmRoot?: string;
    keyframeCanvas: {
      width: number;
      height: number;
    };
    defaultScale: number;
    minScale: number;
    maxScale: number;
    scaleStep: number;
  };
}

export interface StatesConfig {
  states: string[];
  idleVariants: string[];
  pa0KeyframeFolders: string[];
  idleMotion?: IdleMotionConfig;
  motions?: Record<string, MotionConfig>;
  priorities: Record<string, number>;
}

export interface ActionRegistryConfig {
  version: number;
  assetRoot: string;
  fallbackAction: string;
  actionOrder: string[];
  actions: Record<string, ActionDefinition>;
}

export type ActionType = 'state' | 'state_variant' | 'transition' | 'event' | 'interaction' | 'fallback';

export interface ActionDefinition {
  id: string;
  legacyId?: string;
  type: ActionType;
  path: string;
  sourceDir: string;
  webmPath: string;
  fallbackPath: string;
  sourceVideoPaths: string[];
  playback: MotionPlayback;
  runtime: boolean;
  available: boolean;
  protect: boolean;
  returnTo: string;
}

export type MotionPlayback = 'loop' | 'one_shot';

export interface MotionConfig {
  playback: MotionPlayback;
  durationMs: number;
  idleWeight?: number;
}

export interface IdleMotionConfig {
  enabled: boolean;
  minDelayMs: number;
  maxDelayMs: number;
  variants: string[];
  duckSitVariants?: string[];
  standToDuckSitProbability?: number;
  duckSitToStandProbability?: number;
}

export interface PluginsConfig {
  plugins: {
    codex_plugin?: CodexPluginConfig;
    weather_plugin?: {
      enabled: boolean;
    };
    reminder_plugin?: Partial<ReminderPluginConfig>;
    task_plugin?: Partial<TaskPluginConfig>;
    calendar_plugin?: {
      enabled: boolean;
    };
  };
}

export interface CodexPluginConfig {
  enabled: boolean;
  runtimeStatePath: string;
  pollIntervalMs: number;
  thinkingTimeoutMs: number;
  successHoldMs: number;
  errorHoldMs: number;
}

export interface CompanionAPI {
  getCompanionConfig: () => Promise<CompanionConfig>;
  getStatesConfig: () => Promise<StatesConfig>;
  getActionRegistryConfig: () => Promise<ActionRegistryConfig>;
  assetUrl: (relativePath: string) => string;
  getCodexRuntimeState: () => Promise<CodexRenderState | null>;
  getReminderRuntimeState: () => Promise<ReminderNotification | null>;
  listReminders: () => Promise<ReminderRecord[]>;
  createReminder: (input: CreateReminderInput) => Promise<ReminderRecord>;
  dismissReminder: (id: number) => Promise<ReminderRecord | null>;
  dismissReminderNotification: (id: number) => Promise<ReminderRecord | null>;
  snoozeReminder: (id: number, minutes: number) => Promise<ReminderRecord | null>;
  listTasks: () => Promise<TaskCenterSnapshot>;
  createTask: (input: CreateTaskInput) => Promise<TaskRecord>;
  updateTaskStatus: (id: number, status: TaskStatus) => Promise<TaskRecord | null>;
  deleteTask: (id: number) => Promise<boolean>;
  getTaskNotification: () => Promise<TaskNotification | null>;
  dismissTaskNotification: (id: number) => Promise<TaskRecord | null>;
  getWindowControls: () => Promise<WindowControls>;
  setWindowScale: (scale: number) => Promise<number>;
  setMouseMode: (mode: MouseMode) => Promise<WindowControls>;
  setMouseHitTest: (canInteract: boolean) => Promise<boolean>;
  setMouseHitRegions: (regions: MouseHitRegion[]) => Promise<void>;
  setWindowDragActive: (active: boolean) => Promise<void>;
  moveWindowBy: (deltaX: number, deltaY: number) => Promise<void>;
  setMousePassthrough: (enabled: boolean) => Promise<boolean>;
  getManualRenderSelection: () => Promise<ManualRenderSelection | null>;
  setManualRenderSelection: (selection: ManualRenderSelection) => Promise<ManualRenderSelection>;
  getShortcuts: () => Promise<ShortcutBinding[]>;
  updateShortcut: (id: string, accelerator: string) => Promise<ShortcutBinding[]>;
  resetShortcut: (id: string) => Promise<ShortcutBinding[]>;
  getInputPermissionStatus: () => Promise<InputPermissionStatus>;
  openInputPermissionSettings: () => Promise<void>;
  openControlCenter: (module?: ControlCenterModule) => Promise<void>;
  closeControlCenter: () => Promise<void>;
  onMouseHitTestSample: (callback: (point: MouseHitTestPoint) => void) => () => void;
  onCompanionCommand: (callback: (command: CompanionCommand) => void) => () => void;
  onManualRenderSelection: (callback: (selection: ManualRenderSelection | null) => void) => () => void;
  onControlCenterModule: (callback: (module: ControlCenterModule) => void) => () => void;
  onShortcutsUpdated: (callback: (shortcuts: ShortcutBinding[]) => void) => () => void;
  onInputPermissionStatus: (callback: (status: InputPermissionStatus) => void) => () => void;
  onCodexRuntimeState: (callback: (state: CodexRenderState | null) => void) => () => void;
  onReminderRuntimeState: (callback: (state: ReminderNotification | null) => void) => () => void;
  onRemindersUpdated: (callback: (reminders: ReminderRecord[]) => void) => () => void;
  onTaskNotification: (callback: (state: TaskNotification | null) => void) => () => void;
  onTasksUpdated: (callback: (tasks: TaskCenterSnapshot) => void) => () => void;
}

export type CompanionCommand =
  | 'next-state'
  | 'previous-state'
  | 'reset-idle'
  | 'open-control-center'
  | 'toggle-control-center'
  | 'toggle-panel'
  | 'toggle-passthrough'
  | 'toggle-reminders'
  | 'toggle-tasks'
  | 'scale-up'
  | 'scale-down'
  | 'scale-reset';

export type CompanionState =
  | 'idle'
  | 'reading'
  | 'coding'
  | 'thinking'
  | 'waiting_auth'
  | 'success'
  | 'error'
  | 'reminder'
  | 'sleep';

export type CodexRuntimeStatus = Extract<
  CompanionState,
  'idle' | 'coding' | 'thinking' | 'waiting_auth' | 'success' | 'error'
>;

export interface CodexRuntimeState {
  source: 'codex';
  state: CodexRuntimeStatus;
  message?: string;
  task?: string;
  event?: string;
  cwd?: string;
  toolName?: string;
  exitCode?: number;
  timestamp: string;
  expiresAt?: string;
}

export interface CodexRenderState {
  source: 'codex';
  state: CodexRuntimeStatus;
  message: string | null;
  task: string | null;
  event: string | null;
  cwd: string | null;
  toolName: string | null;
  exitCode: number | null;
  timestamp: string | null;
  isStale: boolean;
}

export type ReminderRepeatRule = 'none' | 'daily' | 'weekly' | 'monthly';

export type ReminderPriority = 'high' | 'normal' | 'low';

export type ReminderStatus = 'scheduled' | 'triggered' | 'dismissed';

export interface ReminderPluginConfig {
  enabled: boolean;
  databasePath: string;
  pollIntervalMs: number;
  defaultSnoozeMinutes: number;
  quickCreateMinutes: number[];
}

export interface ReminderRecord {
  id: number;
  title: string;
  dueAt: string;
  repeatRule: ReminderRepeatRule;
  priority: ReminderPriority;
  status: ReminderStatus;
  createdAt: string;
  updatedAt: string;
  triggeredAt: string | null;
}

export interface CreateReminderInput {
  title: string;
  dueAt: string;
  repeatRule?: ReminderRepeatRule;
  priority?: ReminderPriority;
}

export interface ReminderNotification {
  source: 'reminder';
  state: 'reminder';
  message: string;
  reminder: ReminderRecord;
  timestamp: string;
  isStale: boolean;
}

export type TaskSource = 'manual' | 'codex';

export type TaskStatus = 'todo' | 'active' | 'blocked' | 'done' | 'failed';

export interface TaskPluginConfig {
  enabled: boolean;
  databasePath: string;
  pollIntervalMs: number;
  stuckThresholdMs: number;
  recentLimit: number;
}

export interface TaskRecord {
  id: number;
  title: string;
  source: TaskSource;
  status: TaskStatus;
  taskDate: string;
  cwd: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  completedAt: string | null;
  stuckNotifiedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  taskDate?: string;
}

export interface TaskCenterSnapshot {
  today: TaskRecord[];
  currentCodex: TaskRecord | null;
  recentCompleted: TaskRecord[];
}

export interface TaskNotification {
  source: 'task';
  state: 'reminder';
  message: string;
  task: TaskRecord;
  timestamp: string;
  isStale: boolean;
}

export interface WindowControls {
  scale: number;
  mouseMode: MouseMode;
  mousePassthrough: boolean;
}

export type MouseMode = 'smart' | 'interactive';

export type ControlCenterModule = 'status' | 'tasks' | 'reminders' | 'settings';

export type InputPermissionStatus = 'granted' | 'denied' | 'unknown';

export interface ShortcutBinding {
  id: string;
  label: string;
  accelerator: string;
  defaultAccelerator: string;
  editable: boolean;
  enabled: boolean;
}

export interface ManualRenderSelection {
  state: CompanionState;
  variant: string | null;
  folder?: string | null;
  replayId?: number;
}

export interface MouseHitTestPoint {
  x: number;
  y: number;
}

export interface MouseHitRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KeyframeDescriptor {
  folder: string;
  state: string;
  label: string;
  motion: MotionConfig;
  webmRelativePath: string;
  sourceVideoRelativePaths?: string[];
  sourceVideoRelativePath: string;
  fallbackRelativePath: string;
  relativePath: string;
}
