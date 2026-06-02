"use strict";
const electron = require("electron");
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
const COMPANION_COMMANDS = /* @__PURE__ */ new Set([
  "next-state",
  "previous-state",
  "reset-idle",
  "open-control-center",
  "toggle-control-center",
  "toggle-panel",
  "toggle-passthrough",
  "toggle-reminders",
  "toggle-tasks",
  "scale-up",
  "scale-down",
  "scale-reset"
]);
function encodeAssetPath(relativePath) {
  return relativePath.split("/").filter(Boolean).map((segment) => encodeURIComponent(segment)).join("/");
}
const companionAPI = {
  getCompanionConfig: () => electron.ipcRenderer.invoke("config:get-companion"),
  getStatesConfig: () => electron.ipcRenderer.invoke("config:get-states"),
  getActionRegistryConfig: () => electron.ipcRenderer.invoke("config:get-action-registry"),
  getInteractionRulesConfig: () => electron.ipcRenderer.invoke("config:get-interaction-rules"),
  getPetProfiles: () => electron.ipcRenderer.invoke("pet-profile:list"),
  setPetProfile: (profileId) => electron.ipcRenderer.invoke("pet-profile:set", profileId),
  importPetProfile: () => electron.ipcRenderer.invoke("pet-profile:import"),
  removePetProfile: (profileId) => electron.ipcRenderer.invoke("pet-profile:remove", profileId),
  getDeclarativePlugins: () => electron.ipcRenderer.invoke("plugins:get-summary"),
  setDeclarativePluginEnabled: (pluginId, enabled) => electron.ipcRenderer.invoke("plugins:set-enabled", pluginId, enabled),
  refreshDeclarativePlugins: () => electron.ipcRenderer.invoke("plugins:refresh"),
  reportDeclarativePluginFeedback: (result) => {
    electron.ipcRenderer.send("plugins:feedback-result", result);
  },
  assetUrl: (relativePath) => `companion-asset:///${encodeAssetPath(relativePath)}`,
  getCodexRuntimeState: () => electron.ipcRenderer.invoke("codex:get-runtime-state"),
  getAgentRuntimeState: () => electron.ipcRenderer.invoke("agent:get-runtime-state"),
  getAgentConfirmation: () => electron.ipcRenderer.invoke("agent:get-confirmation"),
  respondAgentConfirmation: (requestId, action) => electron.ipcRenderer.invoke("agent:respond-confirmation", requestId, action),
  getCompanionProtocolStatus: () => electron.ipcRenderer.invoke("companion-protocol:get-status"),
  getReminderRuntimeState: () => electron.ipcRenderer.invoke("reminders:get-runtime-state"),
  listReminders: () => electron.ipcRenderer.invoke("reminders:list"),
  createReminder: (input) => electron.ipcRenderer.invoke("reminders:create", input),
  dismissReminder: (id) => electron.ipcRenderer.invoke("reminders:dismiss", id),
  dismissReminderNotification: (id) => electron.ipcRenderer.invoke("reminders:dismiss-notification", id),
  snoozeReminder: (id, minutes) => electron.ipcRenderer.invoke("reminders:snooze", id, minutes),
  listTasks: () => electron.ipcRenderer.invoke("tasks:list"),
  createTask: (input) => electron.ipcRenderer.invoke("tasks:create", input),
  updateTaskStatus: (id, status) => electron.ipcRenderer.invoke("tasks:update-status", id, status),
  deleteTask: (id) => electron.ipcRenderer.invoke("tasks:delete", id),
  getTaskNotification: () => electron.ipcRenderer.invoke("tasks:get-notification"),
  dismissTaskNotification: (id) => electron.ipcRenderer.invoke("tasks:dismiss-notification", id),
  getWindowControls: () => electron.ipcRenderer.invoke("window:get-controls"),
  setWindowScale: (scale) => electron.ipcRenderer.invoke("window:set-scale", scale),
  setMouseMode: (mode) => electron.ipcRenderer.invoke("window:set-mouse-mode", mode),
  setMouseHitTest: (canInteract) => electron.ipcRenderer.invoke("window:set-mouse-hit-test", canInteract),
  setMouseHitRegions: (regions) => electron.ipcRenderer.invoke("window:set-mouse-hit-regions", regions),
  setNativeClickCapture: (enabled) => electron.ipcRenderer.invoke("window:set-native-click-capture", enabled),
  setWindowDragActive: (active) => electron.ipcRenderer.invoke("window:set-drag-active", active),
  moveWindowBy: (deltaX, deltaY) => electron.ipcRenderer.invoke("window:move-by", deltaX, deltaY),
  setMousePassthrough: (enabled) => electron.ipcRenderer.invoke("window:set-mouse-passthrough", enabled),
  getManualRenderSelection: () => electron.ipcRenderer.invoke("render:get-manual-selection"),
  setManualRenderSelection: (selection) => electron.ipcRenderer.invoke("render:set-manual-selection", selection),
  getShortcuts: () => electron.ipcRenderer.invoke("shortcuts:list"),
  updateShortcut: (id, accelerator) => electron.ipcRenderer.invoke("shortcuts:update", id, accelerator),
  resetShortcut: (id) => electron.ipcRenderer.invoke("shortcuts:reset", id),
  getInputPermissionStatus: () => electron.ipcRenderer.invoke("input-permission:get-status"),
  openInputPermissionSettings: () => electron.ipcRenderer.invoke("input-permission:open-settings"),
  openControlCenter: (module) => electron.ipcRenderer.invoke("control-center:open", module),
  closeControlCenter: () => electron.ipcRenderer.invoke("control-center:close"),
  onMouseHitTestSample: (callback) => {
    const listener = (_event, point) => {
      callback(point);
    };
    electron.ipcRenderer.on(MOUSE_HIT_TEST_SAMPLE_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(MOUSE_HIT_TEST_SAMPLE_CHANNEL, listener);
    };
  },
  onCompanionCommand: (callback) => {
    const listener = (_event, command) => {
      if (COMPANION_COMMANDS.has(command)) {
        callback(command);
      }
    };
    electron.ipcRenderer.on(COMPANION_COMMAND_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(COMPANION_COMMAND_CHANNEL, listener);
    };
  },
  onManualRenderSelection: (callback) => {
    const listener = (_event, selection) => {
      callback(selection);
    };
    electron.ipcRenderer.on(MANUAL_RENDER_SELECTION_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(MANUAL_RENDER_SELECTION_CHANNEL, listener);
    };
  },
  onPetProfileChanged: (callback) => {
    const listener = (_event, state) => {
      callback(state);
    };
    electron.ipcRenderer.on(PET_PROFILE_CHANGED_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(PET_PROFILE_CHANGED_CHANNEL, listener);
    };
  },
  onControlCenterModule: (callback) => {
    const listener = (_event, module) => {
      callback(module);
    };
    electron.ipcRenderer.on(CONTROL_CENTER_MODULE_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(CONTROL_CENTER_MODULE_CHANNEL, listener);
    };
  },
  onShortcutsUpdated: (callback) => {
    const listener = (_event, shortcuts) => {
      callback(shortcuts);
    };
    electron.ipcRenderer.on(SHORTCUTS_UPDATED_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(SHORTCUTS_UPDATED_CHANNEL, listener);
    };
  },
  onInputPermissionStatus: (callback) => {
    const listener = (_event, status) => {
      callback(status);
    };
    electron.ipcRenderer.on(INPUT_PERMISSION_STATUS_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(INPUT_PERMISSION_STATUS_CHANNEL, listener);
    };
  },
  onInteractionClick: (callback) => {
    const listener = (_event, point) => {
      callback(point);
    };
    electron.ipcRenderer.on(INTERACTION_CLICK_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(INTERACTION_CLICK_CHANNEL, listener);
    };
  },
  onInteractionDragActive: (callback) => {
    const listener = (_event, active) => {
      callback(active);
    };
    electron.ipcRenderer.on(INTERACTION_DRAG_ACTIVE_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(INTERACTION_DRAG_ACTIVE_CHANNEL, listener);
    };
  },
  onCodexRuntimeState: (callback) => {
    const listener = (_event, state) => {
      callback(state);
    };
    electron.ipcRenderer.on(CODEX_RUNTIME_STATE_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(CODEX_RUNTIME_STATE_CHANNEL, listener);
    };
  },
  onAgentRuntimeState: (callback) => {
    const listener = (_event, state) => {
      callback(state);
    };
    electron.ipcRenderer.on(AGENT_RUNTIME_STATE_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(AGENT_RUNTIME_STATE_CHANNEL, listener);
    };
  },
  onAgentConfirmation: (callback) => {
    const listener = (_event, confirmation) => {
      callback(confirmation);
    };
    electron.ipcRenderer.on(AGENT_CONFIRMATION_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(AGENT_CONFIRMATION_CHANNEL, listener);
    };
  },
  onCompanionProtocolStatus: (callback) => {
    const listener = (_event, status) => {
      callback(status);
    };
    electron.ipcRenderer.on(COMPANION_PROTOCOL_STATUS_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(COMPANION_PROTOCOL_STATUS_CHANNEL, listener);
    };
  },
  onReminderRuntimeState: (callback) => {
    const listener = (_event, state) => {
      callback(state);
    };
    electron.ipcRenderer.on(REMINDER_RUNTIME_STATE_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(REMINDER_RUNTIME_STATE_CHANNEL, listener);
    };
  },
  onRemindersUpdated: (callback) => {
    const listener = (_event, reminders) => {
      callback(reminders);
    };
    electron.ipcRenderer.on(REMINDERS_UPDATED_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(REMINDERS_UPDATED_CHANNEL, listener);
    };
  },
  onTaskNotification: (callback) => {
    const listener = (_event, state) => {
      callback(state);
    };
    electron.ipcRenderer.on(TASK_NOTIFICATION_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(TASK_NOTIFICATION_CHANNEL, listener);
    };
  },
  onTasksUpdated: (callback) => {
    const listener = (_event, tasks) => {
      callback(tasks);
    };
    electron.ipcRenderer.on(TASKS_UPDATED_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(TASKS_UPDATED_CHANNEL, listener);
    };
  },
  onDeclarativePluginFeedback: (callback) => {
    const listener = (_event, feedback) => {
      callback(feedback);
    };
    electron.ipcRenderer.on(DECLARATIVE_PLUGIN_FEEDBACK_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(DECLARATIVE_PLUGIN_FEEDBACK_CHANNEL, listener);
    };
  },
  onDeclarativePluginsUpdated: (callback) => {
    const listener = (_event, summary) => {
      callback(summary);
    };
    electron.ipcRenderer.on(DECLARATIVE_PLUGINS_UPDATED_CHANNEL, listener);
    return () => {
      electron.ipcRenderer.removeListener(DECLARATIVE_PLUGINS_UPDATED_CHANNEL, listener);
    };
  }
};
electron.contextBridge.exposeInMainWorld("companionAPI", companionAPI);
