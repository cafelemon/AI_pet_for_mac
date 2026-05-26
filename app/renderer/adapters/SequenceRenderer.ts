import type {
  ActionDefinition,
  ActionRegistryConfig,
  CompanionConfig,
  KeyframeDescriptor,
  MotionConfig,
  StatesConfig
} from '../../shared/types';

const DEFAULT_MOTION: MotionConfig = {
  playback: 'loop',
  durationMs: 4000
};

function motionForAction(action: ActionDefinition, statesConfig: StatesConfig): MotionConfig {
  return statesConfig.motions?.[action.id] ?? {
    ...DEFAULT_MOTION,
    playback: action.playback
  };
}

function renderableAction(action: ActionDefinition | undefined): action is ActionDefinition {
  return Boolean(action?.runtime && action.available);
}

export function buildKeyframes(
  companionConfig: CompanionConfig,
  statesConfig: StatesConfig,
  actionRegistry: ActionRegistryConfig
): KeyframeDescriptor[] {
  void companionConfig;

  const actionIds = statesConfig.pa0KeyframeFolders.length > 0
    ? statesConfig.pa0KeyframeFolders
    : actionRegistry.actionOrder;
  const fallbackAction = actionRegistry.actions[actionRegistry.fallbackAction];

  return actionIds
    .map((actionId) => actionRegistry.actions[actionId] ?? fallbackAction)
    .filter(renderableAction)
    .map((action) => {
      const sourceVideoPaths = action.sourceVideoPaths.length > 0
        ? action.sourceVideoPaths
        : [`${action.sourceDir}/${action.id}_source.mp4`];

      return {
        folder: action.id,
        state: statesConfig.idleVariants.includes(action.id) ? 'idle' : action.returnTo,
        label: action.id,
        motion: motionForAction(action, statesConfig),
        webmRelativePath: action.webmPath,
        sourceVideoRelativePaths: sourceVideoPaths,
        sourceVideoRelativePath: sourceVideoPaths[0],
        fallbackRelativePath: action.fallbackPath,
        relativePath: action.fallbackPath
      };
    });
}
