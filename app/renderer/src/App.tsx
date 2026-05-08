import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { Bubble } from '../components/Bubble';
import { Companion } from '../components/Companion';
import { ReminderPanel } from '../components/ReminderPanel';
import { StatusPanel } from '../components/StatusPanel';
import { TaskPanel } from '../components/TaskPanel';
import { buildKeyframes } from '../adapters/SequenceRenderer';
import type {
  CodexRenderState,
  CompanionConfig,
  CompanionState,
  ControlCenterModule,
  CreateReminderInput,
  CreateTaskInput,
  InputPermissionStatus,
  KeyframeDescriptor,
  ManualRenderSelection,
  MouseHitRegion,
  ReminderNotification,
  ReminderRecord,
  ShortcutBinding,
  StatesConfig,
  TaskCenterSnapshot,
  TaskNotification,
  TaskStatus,
  WindowControls
} from '../../shared/types';

const RENDER_STATES: CompanionState[] = [
  'idle',
  'coding',
  'thinking',
  'waiting_auth',
  'success',
  'error',
  'reminder',
  'sleep'
];
const STATE_LABELS: Record<CompanionState, string> = {
  idle: 'Idle',
  coding: 'Coding',
  thinking: 'Thinking',
  waiting_auth: 'Waiting Auth',
  success: 'Success',
  error: 'Error',
  reminder: 'Reminder',
  sleep: 'Sleep'
};
const BUBBLE_MESSAGES: Record<CompanionState, string | null> = {
  idle: null,
  coding: '正在工作',
  thinking: '我在思考',
  waiting_auth: '需要你确认一下',
  success: '完成啦',
  error: '出错了',
  reminder: '该提醒了',
  sleep: '休息中'
};
const STATE_KEYFRAME_FOLDERS: Partial<Record<CompanionState, string>> = {
  waiting_auth: 'reminder'
};
const DEFAULT_WINDOW_CONTROLS: WindowControls = {
  scale: 1,
  mouseMode: 'smart',
  mousePassthrough: true
};
const DEFAULT_SNOOZE_MINUTES = 10;
const DEFAULT_IDLE_MOTION = {
  enabled: true,
  minDelayMs: 30000,
  maxDelayMs: 60000,
  variants: ['idle_yawn', 'idle_hair', 'idle_reading']
};
const EMPTY_TASK_SNAPSHOT: TaskCenterSnapshot = {
  today: [],
  currentCodex: null,
  recentCompleted: []
};
const MODULE_LABELS: Record<ControlCenterModule, string> = {
  status: '状态',
  tasks: '任务',
  reminders: '提醒',
  settings: '设置'
};

interface CompanionCatalog {
  states: CompanionState[];
  idleVariants: KeyframeDescriptor[];
  byFolder: Map<string, KeyframeDescriptor>;
  byState: Map<CompanionState, KeyframeDescriptor>;
}

function isCompanionState(state: string): state is CompanionState {
  return RENDER_STATES.includes(state as CompanionState);
}

function keyframeFolderForState(state: CompanionState): string {
  return STATE_KEYFRAME_FOLDERS[state] ?? state;
}

function buildCompanionCatalog(keyframes: KeyframeDescriptor[], statesConfig: StatesConfig): CompanionCatalog {
  const byFolder = new Map(keyframes.map((keyframe) => [keyframe.folder, keyframe]));
  const states = RENDER_STATES.filter(
    (state) => statesConfig.states.includes(state) && byFolder.has(keyframeFolderForState(state))
  );
  const byState = new Map<CompanionState, KeyframeDescriptor>();

  for (const state of states) {
    const keyframe = byFolder.get(keyframeFolderForState(state));
    if (keyframe) {
      byState.set(state, keyframe);
    }
  }

  return {
    states,
    idleVariants: statesConfig.idleVariants
      .map((variant) => byFolder.get(variant))
      .filter((variant): variant is KeyframeDescriptor => Boolean(variant)),
    byFolder,
    byState
  };
}

function defaultCatalogSelection(defaultState: string, catalog: CompanionCatalog): ManualRenderSelection {
  if (isCompanionState(defaultState) && catalog.byState.has(defaultState)) {
    return { state: defaultState, variant: null };
  }

  return { state: catalog.byState.has('idle') ? 'idle' : (catalog.states[0] ?? 'idle'), variant: null };
}

function clampRendererScale(scale: number, companionConfig: CompanionConfig): number {
  const { minScale, maxScale } = companionConfig.renderer;
  return Number(Math.min(Math.max(scale, minScale), maxScale).toFixed(2));
}

function codexBubbleMessage(codexState: CodexRenderState | null, state: CompanionState): string | null {
  if (codexState && codexState.state !== 'idle') {
    return codexState.message ?? codexState.task ?? BUBBLE_MESSAGES[state];
  }

  return BUBBLE_MESSAGES[state];
}

function statePriority(state: CompanionState, statesConfig: StatesConfig): number {
  return statesConfig.priorities[state] ?? 999;
}

function randomDelay(minDelayMs: number, maxDelayMs: number): number {
  const min = Math.max(0, minDelayMs);
  const max = Math.max(min, maxDelayMs);
  return Math.round(min + Math.random() * (max - min));
}

function weightedRandomKeyframe(keyframes: KeyframeDescriptor[]): KeyframeDescriptor | null {
  if (keyframes.length === 0) {
    return null;
  }

  const totalWeight = keyframes.reduce((sum, keyframe) => sum + Math.max(0, keyframe.motion.idleWeight ?? 1), 0);
  if (totalWeight <= 0) {
    return keyframes[Math.floor(Math.random() * keyframes.length)] ?? null;
  }

  let cursor = Math.random() * totalWeight;
  for (const keyframe of keyframes) {
    cursor -= Math.max(0, keyframe.motion.idleWeight ?? 1);
    if (cursor <= 0) {
      return keyframe;
    }
  }

  return keyframes[keyframes.length - 1] ?? null;
}

function moduleFromSearch(): ControlCenterModule {
  const module = new URLSearchParams(window.location.search).get('module');
  return module === 'tasks' || module === 'reminders' || module === 'settings' || module === 'status'
    ? module
    : 'status';
}

function useCompanionCatalog(
  companionConfig: CompanionConfig | null,
  statesConfig: StatesConfig | null
): { keyframes: KeyframeDescriptor[]; catalog: CompanionCatalog | null } {
  const keyframes = useMemo(() => {
    if (!companionConfig || !statesConfig) {
      return [];
    }

    return buildKeyframes(companionConfig, statesConfig);
  }, [companionConfig, statesConfig]);
  const catalog = useMemo(() => {
    if (!statesConfig) {
      return null;
    }

    return buildCompanionCatalog(keyframes, statesConfig);
  }, [keyframes, statesConfig]);

  return { keyframes, catalog };
}

function useRuntimeState(): {
  codexState: CodexRenderState | null;
  reminderState: ReminderNotification | null;
  reminders: ReminderRecord[];
  taskNotification: TaskNotification | null;
  tasks: TaskCenterSnapshot;
  refreshReminders: () => Promise<void>;
  refreshTasks: () => Promise<void>;
} {
  const [codexState, setCodexState] = useState<CodexRenderState | null>(null);
  const [reminderState, setReminderState] = useState<ReminderNotification | null>(null);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [taskNotification, setTaskNotification] = useState<TaskNotification | null>(null);
  const [tasks, setTasks] = useState<TaskCenterSnapshot>(EMPTY_TASK_SNAPSHOT);

  const refreshReminders = useCallback(async (): Promise<void> => {
    setReminders(await window.companionAPI.listReminders());
  }, []);
  const refreshTasks = useCallback(async (): Promise<void> => {
    setTasks(await window.companionAPI.listTasks());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [nextCodex, nextReminderState, nextReminders, nextTaskNotification, nextTasks] = await Promise.all([
        window.companionAPI.getCodexRuntimeState(),
        window.companionAPI.getReminderRuntimeState(),
        window.companionAPI.listReminders(),
        window.companionAPI.getTaskNotification(),
        window.companionAPI.listTasks()
      ]);

      if (!cancelled) {
        setCodexState(nextCodex);
        setReminderState(nextReminderState);
        setReminders(nextReminders);
        setTaskNotification(nextTaskNotification);
        setTasks(nextTasks);
      }
    }

    load().catch((error: unknown) => console.error('Failed to load runtime state', error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => window.companionAPI.onCodexRuntimeState(setCodexState), []);
  useEffect(() => window.companionAPI.onReminderRuntimeState(setReminderState), []);
  useEffect(() => window.companionAPI.onRemindersUpdated(setReminders), []);
  useEffect(() => window.companionAPI.onTaskNotification(setTaskNotification), []);
  useEffect(() => window.companionAPI.onTasksUpdated(setTasks), []);

  return { codexState, reminderState, reminders, taskNotification, tasks, refreshReminders, refreshTasks };
}

function PetRenderer({
  companionConfig,
  statesConfig,
  manualSelection,
  codexState,
  reminderState,
  taskNotification,
  keyframes,
  catalog,
  onHitRegionsChange
}: {
  companionConfig: CompanionConfig;
  statesConfig: StatesConfig;
  manualSelection: ManualRenderSelection | null;
  codexState: CodexRenderState | null;
  reminderState: ReminderNotification | null;
  taskNotification: TaskNotification | null;
  keyframes: KeyframeDescriptor[];
  catalog: CompanionCatalog;
  onHitRegionsChange: (regions: MouseHitRegion[]) => void;
}): ReactElement | null {
  const [idleMotionFolder, setIdleMotionFolder] = useState<string | null>(null);
  const idleMotionTimerRef = useRef<number | null>(null);
  const clearIdleMotionTimer = useCallback((): void => {
    if (idleMotionTimerRef.current !== null) {
      window.clearTimeout(idleMotionTimerRef.current);
      idleMotionTimerRef.current = null;
    }
  }, []);

  const selection = manualSelection ?? defaultCatalogSelection(companionConfig.renderer.defaultState, catalog);
  const codexOverride = codexState && codexState.state !== 'idle' ? codexState : null;
  const reminderOverride = reminderState && !reminderState.isStale ? reminderState : null;
  const taskOverride = taskNotification && !taskNotification.isStale ? taskNotification : null;
  const runtimeCandidates: Array<{ source: 'codex' | 'reminder' | 'task'; state: CompanionState }> = [];

  if (codexOverride) {
    runtimeCandidates.push({ source: 'codex', state: codexOverride.state });
  }
  if (reminderOverride) {
    runtimeCandidates.push({ source: 'reminder', state: reminderOverride.state });
  }
  if (taskOverride) {
    runtimeCandidates.push({ source: 'task', state: taskOverride.state });
  }

  const runtimeOverride =
    runtimeCandidates.sort(
      (left, right) => statePriority(left.state, statesConfig) - statePriority(right.state, statesConfig)
    )[0] ?? null;
  const renderedState = runtimeOverride?.state ?? selection.state;
  const canPlayIdleMotion = !runtimeOverride && selection.state === 'idle' && !selection.variant;
  const renderedVariant = runtimeOverride ? null : idleMotionFolder ?? selection.variant;
  const activeKeyframe =
    (renderedState === 'idle' && renderedVariant ? catalog.byFolder.get(renderedVariant) : undefined) ??
    catalog.byState.get(renderedState) ??
    catalog.byState.get('idle') ??
    keyframes[0];
  const activeMotionDurationMs = activeKeyframe?.motion.durationMs ?? 0;

  useEffect(() => {
    if (!canPlayIdleMotion) {
      clearIdleMotionTimer();
      setIdleMotionFolder(null);
      return undefined;
    }
    if (idleMotionFolder) {
      return undefined;
    }

    const idleMotionConfig = statesConfig.idleMotion ?? DEFAULT_IDLE_MOTION;
    if (!idleMotionConfig.enabled) {
      return undefined;
    }

    const idleMotionKeyframes = idleMotionConfig.variants
      .map((variant) => catalog.byFolder.get(variant))
      .filter((variant): variant is KeyframeDescriptor => Boolean(variant));
    if (idleMotionKeyframes.length === 0) {
      return undefined;
    }

    idleMotionTimerRef.current = window.setTimeout(() => {
      const nextMotion = weightedRandomKeyframe(idleMotionKeyframes);
      if (nextMotion) {
        setIdleMotionFolder(nextMotion.folder);
      }
    }, randomDelay(idleMotionConfig.minDelayMs, idleMotionConfig.maxDelayMs));

    return clearIdleMotionTimer;
  }, [canPlayIdleMotion, catalog.byFolder, clearIdleMotionTimer, idleMotionFolder, statesConfig.idleMotion]);

  useEffect(() => {
    if (!idleMotionFolder || !activeKeyframe) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIdleMotionFolder(null);
    }, activeMotionDurationMs);
    return () => window.clearTimeout(timer);
  }, [activeMotionDurationMs, idleMotionFolder]);

  const handleMotionComplete = useCallback((): void => {
    if (idleMotionFolder) {
      setIdleMotionFolder(null);
    }
  }, [idleMotionFolder]);

  if (!activeKeyframe) {
    return null;
  }

  const bubbleMessage =
    runtimeOverride?.source === 'reminder' && reminderOverride
      ? reminderOverride.message
      : runtimeOverride?.source === 'task' && taskOverride
        ? taskOverride.message
        : codexBubbleMessage(runtimeOverride?.source === 'codex' ? codexOverride : null, renderedState);

  return (
    <main className="companion-shell">
      <div className="companion-stage">
        <Companion
          key={`${renderedState}:${activeKeyframe.folder}`}
          keyframe={activeKeyframe}
          canvas={companionConfig.renderer.keyframeCanvas}
          state={renderedState}
          onHitTesterChange={() => undefined}
          onHitRegionsChange={onHitRegionsChange}
          onMotionComplete={handleMotionComplete}
        />
      </div>
      <Bubble state={renderedState} message={bubbleMessage} actions={null} />
    </main>
  );
}

function PetApp(): ReactElement | null {
  const [companionConfig, setCompanionConfig] = useState<CompanionConfig | null>(null);
  const [statesConfig, setStatesConfig] = useState<StatesConfig | null>(null);
  const [manualSelection, setManualSelection] = useState<ManualRenderSelection | null>(null);
  const { codexState, reminderState, taskNotification } = useRuntimeState();
  const { keyframes, catalog } = useCompanionCatalog(companionConfig, statesConfig);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [nextCompanionConfig, nextStatesConfig, nextSelection] = await Promise.all([
        window.companionAPI.getCompanionConfig(),
        window.companionAPI.getStatesConfig(),
        window.companionAPI.getManualRenderSelection()
      ]);

      if (!cancelled) {
        setCompanionConfig(nextCompanionConfig);
        setStatesConfig(nextStatesConfig);
        setManualSelection(nextSelection);
      }
    }

    load().catch((error: unknown) => console.error('Failed to load pet config', error));
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => window.companionAPI.onManualRenderSelection(setManualSelection), []);

  const publishHitRegions = useCallback((regions: MouseHitRegion[]): void => {
    window.companionAPI.setMouseHitRegions(regions).catch((error: unknown) => {
      console.error('Failed to update pet hit regions', error);
    });
  }, []);

  if (!companionConfig || !statesConfig || !catalog || catalog.states.length === 0) {
    return null;
  }

  return (
    <PetRenderer
      companionConfig={companionConfig}
      statesConfig={statesConfig}
      manualSelection={manualSelection}
      codexState={codexState}
      reminderState={reminderState}
      taskNotification={taskNotification}
      keyframes={keyframes}
      catalog={catalog}
      onHitRegionsChange={publishHitRegions}
    />
  );
}

function SettingsModule({
  shortcuts,
  permissionStatus,
  onUpdateShortcut,
  onResetShortcut
}: {
  shortcuts: ShortcutBinding[];
  permissionStatus: InputPermissionStatus;
  onUpdateShortcut: (id: string, accelerator: string) => Promise<void>;
  onResetShortcut: (id: string) => Promise<void>;
}): ReactElement {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function submitShortcut(event: FormEvent<HTMLFormElement>, shortcut: ShortcutBinding): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await onUpdateShortcut(shortcut.id, drafts[shortcut.id] ?? shortcut.accelerator);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '快捷键更新失败');
    }
  }

  async function resetShortcut(shortcut: ShortcutBinding): Promise<void> {
    setError(null);
    try {
      await onResetShortcut(shortcut.id);
      setDrafts((current) => ({ ...current, [shortcut.id]: shortcut.defaultAccelerator }));
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : '快捷键重置失败');
    }
  }

  return (
    <section className="settings-module">
      <header className="control-module__header">
        <p className="status-panel__eyebrow">PA7</p>
        <h1 className="status-panel__title">设置</h1>
      </header>

      <div className={`permission-card permission-card--${permissionStatus}`}>
        <p className="settings-module__title">macOS 鼠标监听</p>
        <p className="settings-module__meta">
          {permissionStatus === 'granted'
            ? '已授权，⌥+左键拖动、⌥+右键打开控制中心可用。'
            : permissionStatus === 'denied'
              ? '需要在系统设置中授权辅助功能后，⌥+鼠标交互才可用。'
              : '正在检测权限。'}
        </p>
        {permissionStatus !== 'granted' ? (
          <button className="panel-button panel-button--active" type="button" onClick={() => window.companionAPI.openInputPermissionSettings()}>
            打开系统设置
          </button>
        ) : null}
      </div>

      {error ? <p className="settings-module__error">{error}</p> : null}

      <div className="shortcut-list">
        {shortcuts.map((shortcut) => (
          <form className="shortcut-item" key={shortcut.id} onSubmit={(event) => submitShortcut(event, shortcut)}>
            <div>
              <p className="settings-module__title">{shortcut.label}</p>
              <p className="settings-module__meta">{shortcut.enabled ? '已启用' : '未启用'} · 默认 {shortcut.defaultAccelerator}</p>
            </div>
            <input
              className="shortcut-input"
              value={drafts[shortcut.id] ?? shortcut.accelerator}
              aria-label={shortcut.label}
              disabled={!shortcut.editable}
              onChange={(event) => setDrafts((current) => ({ ...current, [shortcut.id]: event.currentTarget.value }))}
            />
            <div className="shortcut-item__actions">
              <button className="mini-button mini-button--primary" type="submit">
                存
              </button>
              <button className="mini-button" type="button" onClick={() => resetShortcut(shortcut)}>
                还
              </button>
            </div>
          </form>
        ))}
      </div>
    </section>
  );
}

function ControlCenterApp(): ReactElement | null {
  const [companionConfig, setCompanionConfig] = useState<CompanionConfig | null>(null);
  const [statesConfig, setStatesConfig] = useState<StatesConfig | null>(null);
  const [windowControls, setWindowControls] = useState<WindowControls>(DEFAULT_WINDOW_CONTROLS);
  const [manualSelection, setManualSelection] = useState<ManualRenderSelection | null>(null);
  const [activeModule, setActiveModule] = useState<ControlCenterModule>(moduleFromSearch);
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<InputPermissionStatus>('unknown');
  const { reminderState, reminders, taskNotification, tasks, refreshReminders, refreshTasks } = useRuntimeState();
  const { catalog } = useCompanionCatalog(companionConfig, statesConfig);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [
        nextCompanionConfig,
        nextStatesConfig,
        nextWindowControls,
        nextSelection,
        nextShortcuts,
        nextPermissionStatus
      ] = await Promise.all([
        window.companionAPI.getCompanionConfig(),
        window.companionAPI.getStatesConfig(),
        window.companionAPI.getWindowControls(),
        window.companionAPI.getManualRenderSelection(),
        window.companionAPI.getShortcuts(),
        window.companionAPI.getInputPermissionStatus()
      ]);

      if (!cancelled) {
        setCompanionConfig(nextCompanionConfig);
        setStatesConfig(nextStatesConfig);
        setWindowControls(nextWindowControls);
        setManualSelection(nextSelection);
        setShortcuts(nextShortcuts);
        setPermissionStatus(nextPermissionStatus);
      }
    }

    load().catch((error: unknown) => console.error('Failed to load control center', error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => window.companionAPI.onManualRenderSelection(setManualSelection), []);
  useEffect(() => window.companionAPI.onControlCenterModule(setActiveModule), []);
  useEffect(() => window.companionAPI.onShortcutsUpdated(setShortcuts), []);
  useEffect(() => window.companionAPI.onInputPermissionStatus(setPermissionStatus), []);

  const setWindowScale = useCallback(
    (scale: number): void => {
      if (!companionConfig) {
        return;
      }

      window.companionAPI
        .setWindowScale(clampRendererScale(scale, companionConfig))
        .then((nextScale) => setWindowControls((controls) => ({ ...controls, scale: nextScale })))
        .catch((error: unknown) => console.error('Failed to update window scale', error));
    },
    [companionConfig]
  );

  const updateManualSelection = useCallback((selection: ManualRenderSelection): void => {
    window.companionAPI
      .setManualRenderSelection(selection)
      .then(setManualSelection)
      .catch((error: unknown) => console.error('Failed to update render selection', error));
  }, []);

  const createReminder = useCallback(
    async (input: CreateReminderInput): Promise<void> => {
      await window.companionAPI.createReminder(input);
      await refreshReminders();
    },
    [refreshReminders]
  );
  const dismissReminder = useCallback(
    async (id: number): Promise<void> => {
      await window.companionAPI.dismissReminder(id);
      await refreshReminders();
    },
    [refreshReminders]
  );
  const dismissReminderNotification = useCallback(
    async (id: number): Promise<void> => {
      await window.companionAPI.dismissReminderNotification(id);
      await refreshReminders();
    },
    [refreshReminders]
  );
  const snoozeReminder = useCallback(
    async (id: number, minutes: number): Promise<void> => {
      await window.companionAPI.snoozeReminder(id, minutes);
      await refreshReminders();
    },
    [refreshReminders]
  );
  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<void> => {
      await window.companionAPI.createTask(input);
      await refreshTasks();
    },
    [refreshTasks]
  );
  const updateTaskStatus = useCallback(
    async (id: number, status: TaskStatus): Promise<void> => {
      await window.companionAPI.updateTaskStatus(id, status);
      await refreshTasks();
    },
    [refreshTasks]
  );
  const deleteTask = useCallback(
    async (id: number): Promise<void> => {
      await window.companionAPI.deleteTask(id);
      await refreshTasks();
    },
    [refreshTasks]
  );
  const dismissTaskNotification = useCallback(
    async (id: number): Promise<void> => {
      await window.companionAPI.dismissTaskNotification(id);
      await refreshTasks();
    },
    [refreshTasks]
  );

  async function updateShortcut(id: string, accelerator: string): Promise<void> {
    setShortcuts(await window.companionAPI.updateShortcut(id, accelerator));
  }

  async function resetShortcut(id: string): Promise<void> {
    setShortcuts(await window.companionAPI.resetShortcut(id));
  }

  if (!companionConfig || !statesConfig || !catalog || catalog.states.length === 0) {
    return null;
  }

  const selection = manualSelection ?? defaultCatalogSelection(companionConfig.renderer.defaultState, catalog);
  const activeReminder = reminderState && !reminderState.isStale ? reminderState : null;
  const activeTaskNotification = taskNotification && !taskNotification.isStale ? taskNotification : null;

  return (
    <main className="control-center-shell">
      <header className="control-center-header">
        <div>
          <p className="status-panel__eyebrow">Desktop Companion</p>
          <h1 className="control-center-title">控制中心</h1>
        </div>
        <button className="icon-button" type="button" aria-label="关闭控制中心" onClick={() => window.companionAPI.closeControlCenter()}>
          x
        </button>
      </header>

      <nav className="control-center-nav" aria-label="控制中心模块">
        {(Object.keys(MODULE_LABELS) as ControlCenterModule[]).map((module) => (
          <button
            key={module}
            className={module === activeModule ? 'control-nav-button control-nav-button--active' : 'control-nav-button'}
            type="button"
            onClick={() => setActiveModule(module)}
          >
            {MODULE_LABELS[module]}
          </button>
        ))}
      </nav>

      <section className="control-center-content">
        {activeModule === 'status' ? (
          <StatusPanel
            open
            states={catalog.states}
            idleVariants={catalog.idleVariants}
            activeState={selection.state}
            activeVariant={selection.variant}
            stateLabels={STATE_LABELS}
            controls={windowControls}
            scaleConfig={companionConfig.renderer}
            onSelectState={(state) => updateManualSelection({ state, variant: null })}
            onSelectIdleVariant={(variant) => updateManualSelection({ state: 'idle', variant })}
            onScaleDown={() => setWindowScale(windowControls.scale - companionConfig.renderer.scaleStep)}
            onScaleUp={() => setWindowScale(windowControls.scale + companionConfig.renderer.scaleStep)}
            onScaleReset={() => setWindowScale(companionConfig.renderer.defaultScale)}
            onClose={() => window.companionAPI.closeControlCenter()}
            showMouseModeToggle={false}
          />
        ) : null}
        {activeModule === 'reminders' ? (
          <ReminderPanel
            open
            reminders={reminders}
            activeReminder={activeReminder}
            defaultSnoozeMinutes={DEFAULT_SNOOZE_MINUTES}
            onCreateReminder={createReminder}
            onDismissReminder={dismissReminder}
            onDismissNotification={dismissReminderNotification}
            onSnoozeReminder={snoozeReminder}
            onClose={() => window.companionAPI.closeControlCenter()}
          />
        ) : null}
        {activeModule === 'tasks' ? (
          <TaskPanel
            open
            snapshot={tasks}
            notification={activeTaskNotification}
            onCreateTask={createTask}
            onUpdateTaskStatus={updateTaskStatus}
            onDeleteTask={deleteTask}
            onDismissNotification={dismissTaskNotification}
            onClose={() => window.companionAPI.closeControlCenter()}
          />
        ) : null}
        {activeModule === 'settings' ? (
          <SettingsModule
            shortcuts={shortcuts}
            permissionStatus={permissionStatus}
            onUpdateShortcut={updateShortcut}
            onResetShortcut={resetShortcut}
          />
        ) : null}
      </section>
    </main>
  );
}

export function App(): ReactElement | null {
  return new URLSearchParams(window.location.search).get('window') === 'control-center' ? (
    <ControlCenterApp />
  ) : (
    <PetApp />
  );
}
