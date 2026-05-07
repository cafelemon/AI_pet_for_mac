export interface CompanionConfig {
  window: {
    alwaysOnTop: boolean;
    transparent: boolean;
    draggable: boolean;
  };
  renderer: {
    defaultState: string;
    assetRoot: string;
    keyframeCanvas: {
      width: number;
      height: number;
    };
  };
}

export interface StatesConfig {
  states: string[];
  idleVariants: string[];
  pa0KeyframeFolders: string[];
  priorities: Record<string, number>;
}

export interface CompanionAPI {
  getCompanionConfig: () => Promise<CompanionConfig>;
  getStatesConfig: () => Promise<StatesConfig>;
  assetUrl: (relativePath: string) => string;
  onKeyframeCommand: (callback: (command: KeyframeCommand) => void) => () => void;
}

export type KeyframeCommand = 'next' | 'previous' | 'idle';

export interface KeyframeDescriptor {
  folder: string;
  state: string;
  label: string;
  relativePath: string;
}
