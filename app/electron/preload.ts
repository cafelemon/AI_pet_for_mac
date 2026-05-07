import { contextBridge, ipcRenderer } from 'electron';

import type { CompanionAPI, CompanionConfig, StatesConfig } from '../shared/types';

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
  assetUrl: (relativePath: string) => `companion-asset:///${encodeAssetPath(relativePath)}`
};

contextBridge.exposeInMainWorld('companionAPI', companionAPI);
