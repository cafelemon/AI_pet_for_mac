import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { Bubble } from '../components/Bubble';
import { Companion } from '../components/Companion';
import { ReminderPanel } from '../components/ReminderPanel';
import { StatusPanel } from '../components/StatusPanel';
import { TaskPanel } from '../components/TaskPanel';
import { buildKeyframes } from '../adapters/SequenceRenderer';
import type { StatusActionGroup } from '../components/StatusPanel';
import type {
  ActionDefinition,
  ActionRegistryConfig,
  AgentConfirmation,
  AgentConfirmationAction,
  AgentRenderState,
  CodexRenderState,
  CompanionConfig,
  CompanionProtocolStatus,
  CompanionState,
  ControlCenterModule,
  CreateReminderInput,
  CreateTaskInput,
  InputPermissionStatus,
  InteractionEventName,
  InteractionRule,
  InteractionRulesConfig,
  KeyframeDescriptor,
  ManualRenderSelection,
  MouseHitRegion,
  PetProfileState,
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
  'reading',
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
  reading: 'Reading',
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
  reading: '正在阅读',
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
  variants: ['idle_yawn', 'idle_hair', 'coding', 'thinking'],
  duckSitVariants: ['duck_sit_head_hair', 'duck_sit_finger_lip', 'duck_sit_stretch'],
  standToDuckSitProbability: 0.35,
  duckSitToStandProbability: 0.3
};
const DUCK_SIT_IDLE = 'duck_sit_idle';
const STAND_TO_DUCK_SIT = 'stand_to_duck_sit';
const DUCK_SIT_TO_STAND = 'duck_sit_to_stand';
const DUCK_SIT_STRETCH = 'duck_sit_stretch';
const DUCK_SIT_TO_SLEEP = 'duck_sit_to_sleep';
const WAKE_FROM_SLEEP_TRANSITION = 'sleep_to_stand';
const STAND_TO_READING = 'stand_to_reading';
const READING_TO_STAND = 'reading_to_stand';
const STAND_TO_CODING = 'stand_to_coding';
const CODING_TO_STAND = 'coding_to_stand';
const STAND_TO_THINKING = 'stand_to_thinking';
const THINKING_TO_STAND = 'thinking_to_stand';
const DRAG_START_EVENT: InteractionEventName = 'drag_start';
const DRAG_HOLD_EVENT: InteractionEventName = 'drag_hold';
const DRAG_END_EVENT: InteractionEventName = 'drag_end';
const SLEEP_ENTRY_FROM_STANDING = [STAND_TO_DUCK_SIT, DUCK_SIT_TO_SLEEP];
const SLEEP_ENTRY_FROM_DUCK_SIT = [DUCK_SIT_TO_SLEEP];
const AUTO_SLEEP_DELAY_MS = 30 * 60 * 1000;
const CONTROL_GROUP_ORDER = ['主状态', '站立小动作', '鸭子坐', '姿态衔接', '事件反馈', '用户交互'];
const EMPTY_TASK_SNAPSHOT: TaskCenterSnapshot = {
  today: [],
  currentCodex: null,
  recentCompleted: []
};
const MODULE_LABELS: Record<ControlCenterModule, string> = {
  status: '状态',
  integrations: 'AI 接入',
  tasks: '任务',
  reminders: '提醒',
  settings: '设置'
};
const RUNTIME_SOURCE_PRIORITY = {
  reminder: 0,
  task: 0,
  agent: 1,
  codex: 2
} as const;

type IdlePosture = 'standing' | 'duck_sit';

interface CompanionCatalog {
  states: CompanionState[];
  idleVariants: KeyframeDescriptor[];
  actionGroups: StatusActionGroup[];
  byFolder: Map<string, KeyframeDescriptor>;
  byState: Map<CompanionState, KeyframeDescriptor>;
}

function isCompanionState(state: string): state is CompanionState {
  return RENDER_STATES.includes(state as CompanionState);
}

function keyframeFolderForState(state: CompanionState): string {
  return STATE_KEYFRAME_FOLDERS[state] ?? state;
}

function stateForActionFolder(folder: string): CompanionState {
  if (isCompanionState(folder)) {
    return folder;
  }

  return folder === DUCK_SIT_TO_SLEEP || folder === WAKE_FROM_SLEEP_TRANSITION ? 'sleep' : 'idle';
}

function controlGroupForAction(action: ActionDefinition): string | null {
  if (!action.runtime || !action.available || action.type === 'fallback') {
    return null;
  }
  if (action.type === 'event') {
    return '事件反馈';
  }
  if (action.type === 'transition') {
    return '姿态衔接';
  }
  if (action.type === 'interaction') {
    return '用户交互';
  }
  if (action.path.includes('/states/duck_sit/')) {
    return '鸭子坐';
  }
  if (action.type === 'state_variant') {
    return '站立小动作';
  }
  return '主状态';
}

function buildActionGroups(
  byFolder: Map<string, KeyframeDescriptor>,
  actionRegistry: ActionRegistryConfig
): StatusActionGroup[] {
  const groups = new Map<string, KeyframeDescriptor[]>();

  for (const actionId of actionRegistry.actionOrder) {
    const action = actionRegistry.actions[actionId];
    const keyframe = byFolder.get(actionId);
    const group = action ? controlGroupForAction(action) : null;
    if (!group || !keyframe) {
      continue;
    }

    groups.set(group, [...(groups.get(group) ?? []), keyframe]);
  }

  return CONTROL_GROUP_ORDER.map((label) => ({
    label,
    actions: groups.get(label) ?? []
  })).filter((group) => group.actions.length > 0);
}

function buildCompanionCatalog(
  keyframes: KeyframeDescriptor[],
  statesConfig: StatesConfig,
  actionRegistry: ActionRegistryConfig
): CompanionCatalog {
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
    actionGroups: buildActionGroups(byFolder, actionRegistry),
    byFolder,
    byState
  };
}

function defaultCatalogSelection(defaultState: string, catalog: CompanionCatalog): ManualRenderSelection {
  if (isCompanionState(defaultState) && catalog.byState.has(defaultState)) {
    return { state: defaultState, variant: null, folder: keyframeFolderForState(defaultState), replayId: 0 };
  }

  const state = catalog.byState.has('idle') ? 'idle' : (catalog.states[0] ?? 'idle');
  return { state, variant: null, folder: keyframeFolderForState(state), replayId: 0 };
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

function runtimeBubbleMessage(
  agentState: AgentRenderState | null,
  codexState: CodexRenderState | null,
  state: CompanionState
): string | null {
  if (agentState && !agentState.isStale) {
    return agentState.message ?? BUBBLE_MESSAGES[state];
  }
  return codexBubbleMessage(codexState, state);
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

function hasFolders(catalog: CompanionCatalog, folders: string[]): boolean {
  return folders.every((folder) => catalog.byFolder.has(folder));
}

function interactionAction(rules: InteractionRulesConfig | null, eventName: InteractionEventName): string | null {
  if (!rules?.enabled) {
    return null;
  }
  return rules.rules[eventName]?.action ?? null;
}

function canInterruptRuntime(rule: InteractionRule | undefined, runtimeOverride: unknown): boolean {
  if (!rule) {
    return false;
  }
  return rule.interruptLevel === 'high' || !runtimeOverride;
}

function availableKeyframes(catalog: CompanionCatalog, folders: string[]): KeyframeDescriptor[] {
  return folders
    .map((folder) => catalog.byFolder.get(folder))
    .filter((keyframe): keyframe is KeyframeDescriptor => Boolean(keyframe));
}

function clampProbability(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, 0), 1);
}

function renderedStateForMotion(folder: string | null, desiredState: CompanionState): CompanionState {
  if (!folder) {
    return desiredState;
  }

  return folder === DUCK_SIT_TO_SLEEP || folder === WAKE_FROM_SLEEP_TRANSITION ? 'sleep' : 'idle';
}

function moduleFromSearch(): ControlCenterModule {
  const module = new URLSearchParams(window.location.search).get('module');
  return module === 'tasks' || module === 'reminders' || module === 'settings' || module === 'integrations' || module === 'status'
    ? module
    : 'status';
}

function useCompanionCatalog(
  companionConfig: CompanionConfig | null,
  statesConfig: StatesConfig | null,
  actionRegistry: ActionRegistryConfig | null
): { keyframes: KeyframeDescriptor[]; catalog: CompanionCatalog | null } {
  const keyframes = useMemo(() => {
    if (!companionConfig || !statesConfig || !actionRegistry) {
      return [];
    }

    return buildKeyframes(companionConfig, statesConfig, actionRegistry);
  }, [actionRegistry, companionConfig, statesConfig]);
  const catalog = useMemo(() => {
    if (!statesConfig || !actionRegistry) {
      return null;
    }

    return buildCompanionCatalog(keyframes, statesConfig, actionRegistry);
  }, [actionRegistry, keyframes, statesConfig]);

  return { keyframes, catalog };
}

function useRuntimeState(): {
  codexState: CodexRenderState | null;
  agentState: AgentRenderState | null;
  reminderState: ReminderNotification | null;
  reminders: ReminderRecord[];
  taskNotification: TaskNotification | null;
  tasks: TaskCenterSnapshot;
  refreshReminders: () => Promise<void>;
  refreshTasks: () => Promise<void>;
} {
  const [codexState, setCodexState] = useState<CodexRenderState | null>(null);
  const [agentState, setAgentState] = useState<AgentRenderState | null>(null);
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
      const [nextCodex, nextAgent, nextReminderState, nextReminders, nextTaskNotification, nextTasks] = await Promise.all([
        window.companionAPI.getCodexRuntimeState(),
        window.companionAPI.getAgentRuntimeState(),
        window.companionAPI.getReminderRuntimeState(),
        window.companionAPI.listReminders(),
        window.companionAPI.getTaskNotification(),
        window.companionAPI.listTasks()
      ]);

      if (!cancelled) {
        setCodexState(nextCodex);
        setAgentState(nextAgent);
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
  useEffect(() => window.companionAPI.onAgentRuntimeState(setAgentState), []);
  useEffect(() => window.companionAPI.onReminderRuntimeState(setReminderState), []);
  useEffect(() => window.companionAPI.onRemindersUpdated(setReminders), []);
  useEffect(() => window.companionAPI.onTaskNotification(setTaskNotification), []);
  useEffect(() => window.companionAPI.onTasksUpdated(setTasks), []);

  return { codexState, agentState, reminderState, reminders, taskNotification, tasks, refreshReminders, refreshTasks };
}

function PetRenderer({
  companionConfig,
  statesConfig,
  manualSelection,
  codexState,
  agentState,
  reminderState,
  taskNotification,
  interactionDragActive,
  interactionRules,
  keyframes,
  catalog,
  onHitRegionsChange
}: {
  companionConfig: CompanionConfig;
  statesConfig: StatesConfig;
  manualSelection: ManualRenderSelection | null;
  codexState: CodexRenderState | null;
  agentState: AgentRenderState | null;
  reminderState: ReminderNotification | null;
  taskNotification: TaskNotification | null;
  interactionDragActive: boolean;
  interactionRules: InteractionRulesConfig | null;
  keyframes: KeyframeDescriptor[];
  catalog: CompanionCatalog;
  onHitRegionsChange: (regions: MouseHitRegion[]) => void;
}): ReactElement | null {
  const [idleMotionFolder, setIdleMotionFolder] = useState<string | null>(null);
  const [interactionMotionFolder, setInteractionMotionFolder] = useState<string | null>(null);
  const [idlePosture, setIdlePosture] = useState<IdlePosture>('standing');
  const [autoSleep, setAutoSleep] = useState(false);
  const idleMotionTimerRef = useRef<number | null>(null);
  const motionQueueRef = useRef<string[]>([]);
  const previousDesiredStateRef = useRef<CompanionState | null>(null);
  const previousDragActiveRef = useRef(false);
  const pointerInsideRef = useRef(false);
  const interactionCooldownsRef = useRef<Partial<Record<InteractionEventName, number>>>({});
  const clearIdleMotionTimer = useCallback((): void => {
    if (idleMotionTimerRef.current !== null) {
      window.clearTimeout(idleMotionTimerRef.current);
      idleMotionTimerRef.current = null;
    }
  }, []);
  const startMotionSequence = useCallback(
    (folders: string[]): boolean => {
      if (folders.length === 0 || !hasFolders(catalog, folders)) {
        return false;
      }

      clearIdleMotionTimer();
      motionQueueRef.current = folders.slice(1);
      setIdleMotionFolder(folders[0]);
      return true;
    },
    [catalog, clearIdleMotionTimer]
  );
  const clearMotionSequence = useCallback((): void => {
    motionQueueRef.current = [];
    setIdleMotionFolder(null);
  }, []);

  const codexOverride = codexState && codexState.state !== 'idle' ? codexState : null;
  const agentOverride = agentState && agentState.state !== 'idle' && !agentState.isStale ? agentState : null;
  const reminderOverride = reminderState && !reminderState.isStale ? reminderState : null;
  const taskOverride = taskNotification && !taskNotification.isStale ? taskNotification : null;
  const runtimeCandidates: Array<{ source: keyof typeof RUNTIME_SOURCE_PRIORITY; state: CompanionState }> = [];

  if (codexOverride) {
    runtimeCandidates.push({ source: 'codex', state: codexOverride.state });
  }
  if (agentOverride) {
    runtimeCandidates.push({ source: 'agent', state: agentOverride.state });
  }
  if (reminderOverride) {
    runtimeCandidates.push({ source: 'reminder', state: reminderOverride.state });
  }
  if (taskOverride) {
    runtimeCandidates.push({ source: 'task', state: taskOverride.state });
  }

  const runtimeOverride =
    runtimeCandidates.sort(
      (left, right) =>
        RUNTIME_SOURCE_PRIORITY[left.source] - RUNTIME_SOURCE_PRIORITY[right.source] ||
        statePriority(left.state, statesConfig) - statePriority(right.state, statesConfig)
    )[0] ?? null;
  const selection = manualSelection ?? defaultCatalogSelection(companionConfig.renderer.defaultState, catalog);
  const selectedFolder = selection.folder ?? selection.variant ?? keyframeFolderForState(selection.state);
  const exactManualFolder =
    !runtimeOverride && selectedFolder !== keyframeFolderForState(selection.state) ? selectedFolder : null;
  const canAutoSleep = !runtimeOverride && selection.state === 'idle' && !selection.variant && !exactManualFolder;

  useEffect(() => {
    if (!canAutoSleep) {
      setAutoSleep(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setAutoSleep(true);
    }, AUTO_SLEEP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [canAutoSleep, selection.state, selection.variant]);

  const desiredState = runtimeOverride?.state ?? (autoSleep ? 'sleep' : selection.state);
  const renderedState = exactManualFolder
    ? renderedStateForMotion(exactManualFolder, desiredState)
    : renderedStateForMotion(idleMotionFolder, desiredState);
  const canPlayIdleMotion =
    desiredState === 'idle' && !runtimeOverride && selection.state === 'idle' && !selection.variant && !exactManualFolder;
  const renderedVariant = !idleMotionFolder && !exactManualFolder && renderedState === 'idle' ? selection.variant : null;
  const manualActionKeyframe = exactManualFolder ? catalog.byFolder.get(exactManualFolder) : undefined;
  const activeMotionKeyframe = idleMotionFolder ? catalog.byFolder.get(idleMotionFolder) : undefined;
  const dragHoldAction = interactionAction(interactionRules, DRAG_HOLD_EVENT);
  const interactionMotionKeyframe =
    !runtimeOverride && interactionMotionFolder ? catalog.byFolder.get(interactionMotionFolder) : undefined;
  const interactionDragKeyframe =
    interactionDragActive && dragHoldAction ? catalog.byFolder.get(dragHoldAction) : undefined;
  const postureIdleKeyframe =
    !idleMotionFolder && renderedState === 'idle' && !renderedVariant && idlePosture === 'duck_sit'
      ? catalog.byFolder.get(DUCK_SIT_IDLE)
      : undefined;
  const activeKeyframe =
    interactionMotionKeyframe ??
    interactionDragKeyframe ??
    manualActionKeyframe ??
    activeMotionKeyframe ??
    (renderedState === 'idle' && renderedVariant ? catalog.byFolder.get(renderedVariant) : undefined) ??
    postureIdleKeyframe ??
    catalog.byState.get(renderedState) ??
    catalog.byState.get('idle') ??
    keyframes[0];
  const activeMotionDurationMs = activeKeyframe?.motion.durationMs ?? 0;

  useEffect(() => {
    if (!interactionMotionKeyframe && !interactionDragKeyframe) {
      return;
    }

    clearIdleMotionTimer();
    clearMotionSequence();
  }, [clearIdleMotionTimer, clearMotionSequence, interactionDragKeyframe, interactionMotionKeyframe]);

  const startInteractionMotion = useCallback(
    (eventName: InteractionEventName): boolean => {
      const rule = interactionRules?.rules[eventName];
      const action = rule?.action;
      if (!interactionRules?.enabled || !rule || !action || !catalog.byFolder.has(action)) {
        return false;
      }
      if (!canInterruptRuntime(rule, runtimeOverride)) {
        return false;
      }
      if (interactionMotionFolder && rule.interruptLevel !== 'high' && eventName !== 'mouse_leave') {
        return false;
      }

      const now = Date.now();
      const lastAt = interactionCooldownsRef.current[eventName] ?? 0;
      if (rule.cooldownMs > 0 && now - lastAt < rule.cooldownMs) {
        return false;
      }

      interactionCooldownsRef.current[eventName] = now;
      clearIdleMotionTimer();
      clearMotionSequence();
      setInteractionMotionFolder(action);
      return true;
    },
    [
      catalog,
      clearIdleMotionTimer,
      clearMotionSequence,
      interactionMotionFolder,
      interactionRules,
      runtimeOverride
    ]
  );

  useEffect(() => {
    const wasDragging = previousDragActiveRef.current;
    previousDragActiveRef.current = interactionDragActive;

    if (interactionDragActive && !wasDragging) {
      startInteractionMotion(DRAG_START_EVENT);
      return;
    }

    if (!interactionDragActive && wasDragging) {
      if (!startInteractionMotion(DRAG_END_EVENT)) {
        setInteractionMotionFolder(null);
      }
    }
  }, [interactionDragActive, startInteractionMotion]);

  useEffect(() => {
    const previousDesiredState = previousDesiredStateRef.current;

    if (desiredState === 'sleep') {
      if (previousDesiredState !== 'sleep') {
        const sleepEntrySequence =
          idlePosture === 'duck_sit' ? SLEEP_ENTRY_FROM_DUCK_SIT : SLEEP_ENTRY_FROM_STANDING;
        startMotionSequence(sleepEntrySequence);
      }
      previousDesiredStateRef.current = desiredState;
      return;
    }

    if (previousDesiredState === 'sleep') {
      if (startMotionSequence([WAKE_FROM_SLEEP_TRANSITION])) {
        setIdlePosture('standing');
      }
    }

    previousDesiredStateRef.current = desiredState;
  }, [desiredState, idleMotionFolder, idlePosture, startMotionSequence]);

  useEffect(() => {
    if (!canPlayIdleMotion) {
      clearIdleMotionTimer();
      if (desiredState !== 'sleep' && idleMotionFolder !== WAKE_FROM_SLEEP_TRANSITION) {
        clearMotionSequence();
      }
      return undefined;
    }
    if (idleMotionFolder) {
      return undefined;
    }

    const idleMotionConfig = statesConfig.idleMotion ?? DEFAULT_IDLE_MOTION;
    if (!idleMotionConfig.enabled) {
      return undefined;
    }

    const standingIdleKeyframes = availableKeyframes(catalog, idleMotionConfig.variants);
    const duckSitIdleKeyframes = availableKeyframes(
      catalog,
      idleMotionConfig.duckSitVariants ?? DEFAULT_IDLE_MOTION.duckSitVariants
    );
    if (standingIdleKeyframes.length === 0 && duckSitIdleKeyframes.length === 0) {
      return undefined;
    }

    idleMotionTimerRef.current = window.setTimeout(() => {
      if (
        idlePosture === 'standing' &&
        catalog.byFolder.has(STAND_TO_DUCK_SIT) &&
        Math.random() < clampProbability(idleMotionConfig.standToDuckSitProbability, 0.35)
      ) {
        startMotionSequence([STAND_TO_DUCK_SIT]);
        return;
      }

      if (
        idlePosture === 'duck_sit' &&
        catalog.byFolder.has(DUCK_SIT_TO_STAND) &&
        Math.random() < clampProbability(idleMotionConfig.duckSitToStandProbability, 0.3)
      ) {
        startMotionSequence([DUCK_SIT_TO_STAND]);
        return;
      }

      const pool = idlePosture === 'duck_sit' ? duckSitIdleKeyframes : standingIdleKeyframes;
      const nextMotion = weightedRandomKeyframe(pool);
      if (nextMotion) {
        startMotionSequence([nextMotion.folder]);
      }
    }, randomDelay(idleMotionConfig.minDelayMs, idleMotionConfig.maxDelayMs));

    return clearIdleMotionTimer;
  }, [
    canPlayIdleMotion,
    catalog,
    clearIdleMotionTimer,
    clearMotionSequence,
    desiredState,
    idleMotionFolder,
    idlePosture,
    startMotionSequence,
    statesConfig.idleMotion
  ]);

  useEffect(() => {
    if (!idleMotionFolder || !activeKeyframe || activeKeyframe.motion.playback !== 'loop') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIdleMotionFolder(null);
    }, activeMotionDurationMs);
    return () => window.clearTimeout(timer);
  }, [activeKeyframe, activeMotionDurationMs, idleMotionFolder]);

  const handleMotionComplete = useCallback((): void => {
    if (interactionMotionFolder) {
      const hoverRule = interactionRules?.rules.mouse_hover;
      if (
        interactionMotionFolder === hoverRule?.action &&
        pointerInsideRef.current &&
        hoverRule.holdAction &&
        !runtimeOverride &&
        catalog.byFolder.has(hoverRule.holdAction)
      ) {
        setInteractionMotionFolder(hoverRule.holdAction);
        return;
      }

      setInteractionMotionFolder(null);
      return;
    }

    const completedFolder = idleMotionFolder;

    if (!completedFolder) {
      return;
    }

    if (completedFolder === STAND_TO_DUCK_SIT) {
      setIdlePosture('duck_sit');
    } else if (completedFolder === DUCK_SIT_TO_STAND || completedFolder === WAKE_FROM_SLEEP_TRANSITION) {
      setIdlePosture('standing');
    }

    const nextFolder = motionQueueRef.current.shift();
    if (nextFolder) {
      setIdleMotionFolder(nextFolder);
      return;
    }

    setIdleMotionFolder(null);
  }, [catalog, idleMotionFolder, interactionMotionFolder, interactionRules, runtimeOverride]);

  if (!activeKeyframe) {
    return null;
  }

  const bubbleMessage =
    runtimeOverride?.source === 'reminder' && reminderOverride
      ? reminderOverride.message
        : runtimeOverride?.source === 'task' && taskOverride
          ? taskOverride.message
        : runtimeBubbleMessage(
            runtimeOverride?.source === 'agent' ? agentOverride : null,
            runtimeOverride?.source === 'codex' ? codexOverride : null,
            renderedState
          );
  const handlePointerEnter = useCallback((): void => {
    pointerInsideRef.current = true;
    startInteractionMotion('mouse_hover');
  }, [startInteractionMotion]);
  const handlePointerLeave = useCallback((): void => {
    pointerInsideRef.current = false;
    if (!startInteractionMotion('mouse_leave')) {
      setInteractionMotionFolder(null);
    }
  }, [startInteractionMotion]);

  return (
    <main className="companion-shell">
      <div
        className="companion-stage"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <Companion
          key={`${renderedState}:${activeKeyframe.folder}:${interactionDragActive ? 'dragging' : (selection.replayId ?? 0)}`}
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
  const [actionRegistry, setActionRegistry] = useState<ActionRegistryConfig | null>(null);
  const [interactionRules, setInteractionRules] = useState<InteractionRulesConfig | null>(null);
  const [manualSelection, setManualSelection] = useState<ManualRenderSelection | null>(null);
  const [interactionDragActive, setInteractionDragActive] = useState(false);
  const { codexState, agentState, reminderState, taskNotification } = useRuntimeState();
  const { keyframes, catalog } = useCompanionCatalog(companionConfig, statesConfig, actionRegistry);

  const loadPetConfig = useCallback(async (): Promise<void> => {
    const [nextCompanionConfig, nextStatesConfig, nextActionRegistry, nextInteractionRules, nextSelection] = await Promise.all([
      window.companionAPI.getCompanionConfig(),
      window.companionAPI.getStatesConfig(),
      window.companionAPI.getActionRegistryConfig(),
      window.companionAPI.getInteractionRulesConfig(),
      window.companionAPI.getManualRenderSelection()
    ]);

    setCompanionConfig(nextCompanionConfig);
    setStatesConfig(nextStatesConfig);
    setActionRegistry(nextActionRegistry);
    setInteractionRules(nextInteractionRules);
    setManualSelection(nextSelection);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadPetConfig().catch((error: unknown) => {
      if (!cancelled) {
        console.error('Failed to load pet config', error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadPetConfig]);
  useEffect(() => window.companionAPI.onManualRenderSelection(setManualSelection), []);
  useEffect(() => window.companionAPI.onInteractionDragActive(setInteractionDragActive), []);
  useEffect(
    () =>
      window.companionAPI.onPetProfileChanged(() => {
        loadPetConfig().catch((error: unknown) => console.error('Failed to reload pet profile', error));
      }),
    [loadPetConfig]
  );

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
      agentState={agentState}
      reminderState={reminderState}
      taskNotification={taskNotification}
      interactionDragActive={interactionDragActive}
      interactionRules={interactionRules}
      keyframes={keyframes}
      catalog={catalog}
      onHitRegionsChange={publishHitRegions}
    />
  );
}

function SettingsModule({
  shortcuts,
  permissionStatus,
  petProfiles,
  onSelectPetProfile,
  onUpdateShortcut,
  onResetShortcut
}: {
  shortcuts: ShortcutBinding[];
  permissionStatus: InputPermissionStatus;
  petProfiles: PetProfileState | null;
  onSelectPetProfile: (profileId: string) => void;
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

      {petProfiles ? (
        <div className="profile-card">
          <p className="settings-module__title">桌宠形象</p>
          <div className="profile-list">
            {petProfiles.profiles.map((profile) => (
              <button
                className={profile.selected ? 'profile-option profile-option--active' : 'profile-option'}
                disabled={profile.selected || !profile.ready}
                key={profile.id}
                type="button"
                onClick={() => onSelectPetProfile(profile.id)}
              >
                <span className="profile-option__label">{profile.label}</span>
                <span className="profile-option__meta">
                  {profile.ready ? (profile.selected ? '使用中' : '可切换') : profile.reason}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

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

function confirmationStatusLabel(status: AgentConfirmation['status']): string {
  return {
    pending: '等待确认',
    allowed: '已允许',
    denied: '已拒绝',
    cancelled: '已取消',
    expired: '已过期'
  }[status];
}

function IntegrationsModule({
  protocolStatus,
  confirmation,
  onRespondConfirmation
}: {
  protocolStatus: CompanionProtocolStatus | null;
  confirmation: AgentConfirmation | null;
  onRespondConfirmation: (requestId: string, action: AgentConfirmationAction) => Promise<void>;
}): ReactElement {
  const mcpCommand = 'node scripts/companion_mcp_server.mjs';
  const agentState = protocolStatus?.agentState ?? null;
  const activeConfirmation = confirmation ?? protocolStatus?.confirmation ?? null;
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const statusText = protocolStatus
    ? protocolStatus.enabled
      ? protocolStatus.running
        ? '运行中'
        : '已启用，等待启动'
      : '未启用'
    : '加载中';

  return (
    <section className="settings-module">
      <header className="control-module__header">
        <p className="status-panel__eyebrow">V1.1</p>
        <h1 className="status-panel__title">AI 接入</h1>
      </header>

      <div className={protocolStatus?.running ? 'integration-card integration-card--active' : 'integration-card'}>
        <p className="settings-module__title">Companion Protocol</p>
        <p className="settings-module__meta">
          {statusText} · v{protocolStatus?.protocolVersion ?? 1} · {protocolStatus?.transport ?? 'unix-socket'}
        </p>
        <div className="integration-facts">
          <span>App {protocolStatus?.appVersion ?? '-'}</span>
          <span>Socket {protocolStatus?.socketPath ? 'ready' : '-'}</span>
          <span>Discovery {protocolStatus?.discoveryPath ? 'ready' : '-'}</span>
        </div>
        <div className="integration-facts">
          <span>Agent {agentState?.status ?? '-'}</span>
          <span>Runtime {agentState?.state ?? '-'}</span>
          <span>Expires {agentState?.expiresAt ? new Date(agentState.expiresAt).toLocaleTimeString() : '-'}</span>
        </div>
        {protocolStatus?.lastError ? <p className="settings-module__error">{protocolStatus.lastError}</p> : null}
      </div>

      <div className="integration-card">
        <p className="settings-module__title">MCP stdio</p>
        <p className="settings-module__meta">{mcpCommand}</p>
        <p className="settings-module__meta">可用工具：companion_status / companion_react / companion_say / companion_agent_set_state / companion_agent_get_state / companion_agent_clear_state / companion_confirm_request / companion_confirm_get / companion_confirm_cancel / companion_context_summary / companion_activity_list / companion_profile_list / companion_profile_capabilities / companion_profile_select</p>
      </div>

      <div className={activeConfirmation?.status === 'pending' ? 'integration-card integration-card--attention' : 'integration-card'}>
        <p className="settings-module__title">确认请求</p>
        {activeConfirmation ? (
          <>
            <p className="confirmation-card__title">{activeConfirmation.title}</p>
            <p className="settings-module__meta">{activeConfirmation.message}</p>
            <div className="integration-facts">
              <span>{confirmationStatusLabel(activeConfirmation.status)}</span>
              <span>Expires {new Date(activeConfirmation.expiresAt).toLocaleTimeString()}</span>
            </div>
            {activeConfirmation.status === 'pending' ? (
              <div className="confirmation-actions">
                {[
                  ['allow', '允许'],
                  ['deny', '拒绝'],
                  ['cancel', '取消']
                ].map(([action, label]) => (
                  <button
                    className={action === 'allow' ? 'mini-button mini-button--primary' : 'mini-button'}
                    key={action}
                    type="button"
                    onClick={() => {
                      setConfirmationError(null);
                      onRespondConfirmation(activeConfirmation.requestId, action as AgentConfirmationAction).catch((error: unknown) => {
                        setConfirmationError(error instanceof Error ? error.message : '确认失败');
                      });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {confirmationError ? <p className="settings-module__error">{confirmationError}</p> : null}
          </>
        ) : (
          <p className="settings-module__meta">暂无待确认请求</p>
        )}
      </div>
    </section>
  );
}

function ControlCenterApp(): ReactElement | null {
  const [companionConfig, setCompanionConfig] = useState<CompanionConfig | null>(null);
  const [statesConfig, setStatesConfig] = useState<StatesConfig | null>(null);
  const [actionRegistry, setActionRegistry] = useState<ActionRegistryConfig | null>(null);
  const [windowControls, setWindowControls] = useState<WindowControls>(DEFAULT_WINDOW_CONTROLS);
  const [manualSelection, setManualSelection] = useState<ManualRenderSelection | null>(null);
  const [activeModule, setActiveModule] = useState<ControlCenterModule>(moduleFromSearch);
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<InputPermissionStatus>('unknown');
  const [petProfiles, setPetProfiles] = useState<PetProfileState | null>(null);
  const [protocolStatus, setProtocolStatus] = useState<CompanionProtocolStatus | null>(null);
  const [agentConfirmation, setAgentConfirmation] = useState<AgentConfirmation | null>(null);
  const { reminderState, reminders, taskNotification, tasks, refreshReminders, refreshTasks } = useRuntimeState();
  const { catalog } = useCompanionCatalog(companionConfig, statesConfig, actionRegistry);

  const loadControlCenter = useCallback(async (): Promise<void> => {
    const [
      nextCompanionConfig,
      nextStatesConfig,
      nextActionRegistry,
      nextWindowControls,
      nextSelection,
      nextShortcuts,
      nextPermissionStatus,
      nextPetProfiles,
      nextProtocolStatus,
      nextAgentConfirmation
    ] = await Promise.all([
      window.companionAPI.getCompanionConfig(),
      window.companionAPI.getStatesConfig(),
      window.companionAPI.getActionRegistryConfig(),
      window.companionAPI.getWindowControls(),
      window.companionAPI.getManualRenderSelection(),
      window.companionAPI.getShortcuts(),
      window.companionAPI.getInputPermissionStatus(),
      window.companionAPI.getPetProfiles(),
      window.companionAPI.getCompanionProtocolStatus(),
      window.companionAPI.getAgentConfirmation()
    ]);

    setCompanionConfig(nextCompanionConfig);
    setStatesConfig(nextStatesConfig);
    setActionRegistry(nextActionRegistry);
    setWindowControls(nextWindowControls);
    setManualSelection(nextSelection);
    setShortcuts(nextShortcuts);
    setPermissionStatus(nextPermissionStatus);
    setPetProfiles(nextPetProfiles);
    setProtocolStatus(nextProtocolStatus);
    setAgentConfirmation(nextAgentConfirmation);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadControlCenter().catch((error: unknown) => {
      if (!cancelled) {
        console.error('Failed to load control center', error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadControlCenter]);

  useEffect(() => window.companionAPI.onManualRenderSelection(setManualSelection), []);
  useEffect(
    () =>
      window.companionAPI.onPetProfileChanged((state) => {
        setPetProfiles(state);
        loadControlCenter().catch((error: unknown) => console.error('Failed to reload pet profile', error));
      }),
    [loadControlCenter]
  );
  useEffect(() => window.companionAPI.onControlCenterModule(setActiveModule), []);
  useEffect(() => window.companionAPI.onShortcutsUpdated(setShortcuts), []);
  useEffect(() => window.companionAPI.onInputPermissionStatus(setPermissionStatus), []);
  useEffect(() => window.companionAPI.onCompanionProtocolStatus(setProtocolStatus), []);
  useEffect(() => window.companionAPI.onAgentConfirmation(setAgentConfirmation), []);

  const respondAgentConfirmation = useCallback(async (requestId: string, action: AgentConfirmationAction): Promise<void> => {
    setAgentConfirmation(await window.companionAPI.respondAgentConfirmation(requestId, action));
    setProtocolStatus(await window.companionAPI.getCompanionProtocolStatus());
  }, []);

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

  const updatePetProfile = useCallback((profileId: string): void => {
    window.companionAPI
      .setPetProfile(profileId)
      .then(setPetProfiles)
      .catch((error: unknown) => console.error('Failed to update pet profile', error));
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
  const activeFolder = selection.folder ?? selection.variant ?? keyframeFolderForState(selection.state);
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
            actionGroups={catalog.actionGroups}
            activeState={selection.state}
            activeFolder={activeFolder}
            stateLabels={STATE_LABELS}
            controls={windowControls}
            scaleConfig={companionConfig.renderer}
            onSelectAction={(action) => {
              const state = stateForActionFolder(action.folder);
              updateManualSelection({
                state,
                variant: action.folder === keyframeFolderForState(state) ? null : action.folder,
                folder: action.folder,
                replayId: Date.now()
              });
            }}
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
        {activeModule === 'integrations' ? (
          <IntegrationsModule
            confirmation={agentConfirmation}
            onRespondConfirmation={respondAgentConfirmation}
            protocolStatus={protocolStatus}
          />
        ) : null}
        {activeModule === 'settings' ? (
          <SettingsModule
            shortcuts={shortcuts}
            permissionStatus={permissionStatus}
            petProfiles={petProfiles}
            onSelectPetProfile={updatePetProfile}
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
