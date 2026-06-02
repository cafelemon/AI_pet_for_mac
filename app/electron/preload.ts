import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

import type {
  ActionRegistryConfig,
  AgentConfirmation,
  AgentConfirmationAction,
  AgentRenderState,
  CodexRenderState,
  CompanionAPI,
  CompanionCommand,
  CompanionConfig,
  CompanionProtocolStatus,
  ControlCenterModule,
  CreateReminderInput,
  CreateTaskInput,
  DeclarativePluginFeedback,
  DeclarativePluginFeedbackResult,
  DeclarativePluginSummary,
  InputPermissionStatus,
  InteractionRulesConfig,
  ManualRenderSelection,
  MouseHitRegion,
  MouseMode,
  MouseHitTestPoint,
  PetProfileState,
  ReminderNotification,
  ReminderRecord,
  ShortcutBinding,
  StatesConfig,
  TaskCenterSnapshot,
  TaskNotification,
  TaskRecord,
  TaskStatus,
  WindowControls
} from '../shared/types';

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
const INTERACTION_CLICK_CHANNEL = 'interaction:click';
const INTERACTION_DRAG_ACTIVE_CHANNEL = 'interaction:drag-active';
const DECLARATIVE_PLUGIN_FEEDBACK_CHANNEL = 'plugin:feedback';
const DECLARATIVE_PLUGINS_UPDATED_CHANNEL = 'plugin:updated';
const COMPANION_COMMANDS = new Set<CompanionCommand>([
  'next-state',
  'previous-state',
  'reset-idle',
  'open-control-center',
  'toggle-control-center',
  'toggle-panel',
  'toggle-passthrough',
  'toggle-reminders',
  'toggle-tasks',
  'scale-up',
  'scale-down',
  'scale-reset'
]);

function encodeAssetPath(relativePath: string): string {
  return relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

const companionAPI: CompanionAPI = {
  getCompanionConfig: () => ipcRenderer.invoke('config:get-companion') as Promise<CompanionConfig>,
  getStatesConfig: () => ipcRenderer.invoke('config:get-states') as Promise<StatesConfig>,
  getActionRegistryConfig: () =>
    ipcRenderer.invoke('config:get-action-registry') as Promise<ActionRegistryConfig>,
  getInteractionRulesConfig: () =>
    ipcRenderer.invoke('config:get-interaction-rules') as Promise<InteractionRulesConfig>,
  getPetProfiles: () => ipcRenderer.invoke('pet-profile:list') as Promise<PetProfileState>,
  setPetProfile: (profileId: string) => ipcRenderer.invoke('pet-profile:set', profileId) as Promise<PetProfileState>,
  importPetProfile: () => ipcRenderer.invoke('pet-profile:import') as Promise<PetProfileState>,
  removePetProfile: (profileId: string) => ipcRenderer.invoke('pet-profile:remove', profileId) as Promise<PetProfileState>,
  getDeclarativePlugins: () => ipcRenderer.invoke('plugins:get-summary') as Promise<DeclarativePluginSummary>,
  setDeclarativePluginEnabled: (pluginId: string, enabled: boolean) =>
    ipcRenderer.invoke('plugins:set-enabled', pluginId, enabled) as Promise<DeclarativePluginSummary>,
  refreshDeclarativePlugins: () => ipcRenderer.invoke('plugins:refresh') as Promise<DeclarativePluginSummary>,
  reportDeclarativePluginFeedback: (result: DeclarativePluginFeedbackResult) => {
    ipcRenderer.send('plugins:feedback-result', result);
  },
  assetUrl: (relativePath: string) => `companion-asset:///${encodeAssetPath(relativePath)}`,
  getCodexRuntimeState: () => ipcRenderer.invoke('codex:get-runtime-state') as Promise<CodexRenderState | null>,
  getAgentRuntimeState: () => ipcRenderer.invoke('agent:get-runtime-state') as Promise<AgentRenderState | null>,
  getAgentConfirmation: () => ipcRenderer.invoke('agent:get-confirmation') as Promise<AgentConfirmation | null>,
  respondAgentConfirmation: (requestId: string, action: AgentConfirmationAction) =>
    ipcRenderer.invoke('agent:respond-confirmation', requestId, action) as Promise<AgentConfirmation | null>,
  getCompanionProtocolStatus: () =>
    ipcRenderer.invoke('companion-protocol:get-status') as Promise<CompanionProtocolStatus>,
  getReminderRuntimeState: () =>
    ipcRenderer.invoke('reminders:get-runtime-state') as Promise<ReminderNotification | null>,
  listReminders: () => ipcRenderer.invoke('reminders:list') as Promise<ReminderRecord[]>,
  createReminder: (input: CreateReminderInput) =>
    ipcRenderer.invoke('reminders:create', input) as Promise<ReminderRecord>,
  dismissReminder: (id: number) => ipcRenderer.invoke('reminders:dismiss', id) as Promise<ReminderRecord | null>,
  dismissReminderNotification: (id: number) =>
    ipcRenderer.invoke('reminders:dismiss-notification', id) as Promise<ReminderRecord | null>,
  snoozeReminder: (id: number, minutes: number) =>
    ipcRenderer.invoke('reminders:snooze', id, minutes) as Promise<ReminderRecord | null>,
  listTasks: () => ipcRenderer.invoke('tasks:list') as Promise<TaskCenterSnapshot>,
  createTask: (input: CreateTaskInput) => ipcRenderer.invoke('tasks:create', input) as Promise<TaskRecord>,
  updateTaskStatus: (id: number, status: TaskStatus) =>
    ipcRenderer.invoke('tasks:update-status', id, status) as Promise<TaskRecord | null>,
  deleteTask: (id: number) => ipcRenderer.invoke('tasks:delete', id) as Promise<boolean>,
  getTaskNotification: () => ipcRenderer.invoke('tasks:get-notification') as Promise<TaskNotification | null>,
  dismissTaskNotification: (id: number) =>
    ipcRenderer.invoke('tasks:dismiss-notification', id) as Promise<TaskRecord | null>,
  getWindowControls: () => ipcRenderer.invoke('window:get-controls') as Promise<WindowControls>,
  setWindowScale: (scale: number) => ipcRenderer.invoke('window:set-scale', scale) as Promise<number>,
  setMouseMode: (mode: MouseMode) => ipcRenderer.invoke('window:set-mouse-mode', mode) as Promise<WindowControls>,
  setMouseHitTest: (canInteract: boolean) =>
    ipcRenderer.invoke('window:set-mouse-hit-test', canInteract) as Promise<boolean>,
  setMouseHitRegions: (regions: MouseHitRegion[]) =>
    ipcRenderer.invoke('window:set-mouse-hit-regions', regions) as Promise<void>,
  setNativeClickCapture: (enabled: boolean) =>
    ipcRenderer.invoke('window:set-native-click-capture', enabled) as Promise<void>,
  setWindowDragActive: (active: boolean) =>
    ipcRenderer.invoke('window:set-drag-active', active) as Promise<void>,
  moveWindowBy: (deltaX: number, deltaY: number) =>
    ipcRenderer.invoke('window:move-by', deltaX, deltaY) as Promise<void>,
  setMousePassthrough: (enabled: boolean) =>
    ipcRenderer.invoke('window:set-mouse-passthrough', enabled) as Promise<boolean>,
  getManualRenderSelection: () =>
    ipcRenderer.invoke('render:get-manual-selection') as Promise<ManualRenderSelection | null>,
  setManualRenderSelection: (selection: ManualRenderSelection) =>
    ipcRenderer.invoke('render:set-manual-selection', selection) as Promise<ManualRenderSelection>,
  getShortcuts: () => ipcRenderer.invoke('shortcuts:list') as Promise<ShortcutBinding[]>,
  updateShortcut: (id: string, accelerator: string) =>
    ipcRenderer.invoke('shortcuts:update', id, accelerator) as Promise<ShortcutBinding[]>,
  resetShortcut: (id: string) => ipcRenderer.invoke('shortcuts:reset', id) as Promise<ShortcutBinding[]>,
  getInputPermissionStatus: () =>
    ipcRenderer.invoke('input-permission:get-status') as Promise<InputPermissionStatus>,
  openInputPermissionSettings: () => ipcRenderer.invoke('input-permission:open-settings') as Promise<void>,
  openControlCenter: (module?: ControlCenterModule) =>
    ipcRenderer.invoke('control-center:open', module) as Promise<void>,
  closeControlCenter: () => ipcRenderer.invoke('control-center:close') as Promise<void>,
  onMouseHitTestSample: (callback) => {
    const listener = (_event: IpcRendererEvent, point: MouseHitTestPoint): void => {
      callback(point);
    };

    ipcRenderer.on(MOUSE_HIT_TEST_SAMPLE_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(MOUSE_HIT_TEST_SAMPLE_CHANNEL, listener);
    };
  },
  onCompanionCommand: (callback) => {
    const listener = (_event: IpcRendererEvent, command: unknown): void => {
      if (COMPANION_COMMANDS.has(command as CompanionCommand)) {
        callback(command as CompanionCommand);
      }
    };

    ipcRenderer.on(COMPANION_COMMAND_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(COMPANION_COMMAND_CHANNEL, listener);
    };
  },
  onManualRenderSelection: (callback) => {
    const listener = (_event: IpcRendererEvent, selection: ManualRenderSelection | null): void => {
      callback(selection);
    };

    ipcRenderer.on(MANUAL_RENDER_SELECTION_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(MANUAL_RENDER_SELECTION_CHANNEL, listener);
    };
  },
  onPetProfileChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, state: PetProfileState): void => {
      callback(state);
    };

    ipcRenderer.on(PET_PROFILE_CHANGED_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(PET_PROFILE_CHANGED_CHANNEL, listener);
    };
  },
  onControlCenterModule: (callback) => {
    const listener = (_event: IpcRendererEvent, module: ControlCenterModule): void => {
      callback(module);
    };

    ipcRenderer.on(CONTROL_CENTER_MODULE_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(CONTROL_CENTER_MODULE_CHANNEL, listener);
    };
  },
  onShortcutsUpdated: (callback) => {
    const listener = (_event: IpcRendererEvent, shortcuts: ShortcutBinding[]): void => {
      callback(shortcuts);
    };

    ipcRenderer.on(SHORTCUTS_UPDATED_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(SHORTCUTS_UPDATED_CHANNEL, listener);
    };
  },
  onInputPermissionStatus: (callback) => {
    const listener = (_event: IpcRendererEvent, status: InputPermissionStatus): void => {
      callback(status);
    };

    ipcRenderer.on(INPUT_PERMISSION_STATUS_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(INPUT_PERMISSION_STATUS_CHANNEL, listener);
    };
  },
  onInteractionClick: (callback) => {
    const listener = (_event: IpcRendererEvent, point: MouseHitTestPoint): void => {
      callback(point);
    };

    ipcRenderer.on(INTERACTION_CLICK_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(INTERACTION_CLICK_CHANNEL, listener);
    };
  },
  onInteractionDragActive: (callback) => {
    const listener = (_event: IpcRendererEvent, active: boolean): void => {
      callback(active);
    };

    ipcRenderer.on(INTERACTION_DRAG_ACTIVE_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(INTERACTION_DRAG_ACTIVE_CHANNEL, listener);
    };
  },
  onCodexRuntimeState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: CodexRenderState | null): void => {
      callback(state);
    };

    ipcRenderer.on(CODEX_RUNTIME_STATE_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(CODEX_RUNTIME_STATE_CHANNEL, listener);
    };
  },
  onAgentRuntimeState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: AgentRenderState | null): void => {
      callback(state);
    };

    ipcRenderer.on(AGENT_RUNTIME_STATE_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(AGENT_RUNTIME_STATE_CHANNEL, listener);
    };
  },
  onAgentConfirmation: (callback) => {
    const listener = (_event: IpcRendererEvent, confirmation: AgentConfirmation | null): void => {
      callback(confirmation);
    };

    ipcRenderer.on(AGENT_CONFIRMATION_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(AGENT_CONFIRMATION_CHANNEL, listener);
    };
  },
  onCompanionProtocolStatus: (callback) => {
    const listener = (_event: IpcRendererEvent, status: CompanionProtocolStatus): void => {
      callback(status);
    };

    ipcRenderer.on(COMPANION_PROTOCOL_STATUS_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(COMPANION_PROTOCOL_STATUS_CHANNEL, listener);
    };
  },
  onReminderRuntimeState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: ReminderNotification | null): void => {
      callback(state);
    };

    ipcRenderer.on(REMINDER_RUNTIME_STATE_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(REMINDER_RUNTIME_STATE_CHANNEL, listener);
    };
  },
  onRemindersUpdated: (callback) => {
    const listener = (_event: IpcRendererEvent, reminders: ReminderRecord[]): void => {
      callback(reminders);
    };

    ipcRenderer.on(REMINDERS_UPDATED_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(REMINDERS_UPDATED_CHANNEL, listener);
    };
  },
  onTaskNotification: (callback) => {
    const listener = (_event: IpcRendererEvent, state: TaskNotification | null): void => {
      callback(state);
    };

    ipcRenderer.on(TASK_NOTIFICATION_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(TASK_NOTIFICATION_CHANNEL, listener);
    };
  },
  onTasksUpdated: (callback) => {
    const listener = (_event: IpcRendererEvent, tasks: TaskCenterSnapshot): void => {
      callback(tasks);
    };

    ipcRenderer.on(TASKS_UPDATED_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(TASKS_UPDATED_CHANNEL, listener);
    };
  },
  onDeclarativePluginFeedback: (callback) => {
    const listener = (_event: IpcRendererEvent, feedback: DeclarativePluginFeedback): void => {
      callback(feedback);
    };

    ipcRenderer.on(DECLARATIVE_PLUGIN_FEEDBACK_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(DECLARATIVE_PLUGIN_FEEDBACK_CHANNEL, listener);
    };
  },
  onDeclarativePluginsUpdated: (callback) => {
    const listener = (_event: IpcRendererEvent, summary: DeclarativePluginSummary): void => {
      callback(summary);
    };

    ipcRenderer.on(DECLARATIVE_PLUGINS_UPDATED_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(DECLARATIVE_PLUGINS_UPDATED_CHANNEL, listener);
    };
  }
};

contextBridge.exposeInMainWorld('companionAPI', companionAPI);
