/// <reference types="vite/client" />

import type { CompanionAPI } from '../shared/types';

declare global {
  interface Window {
    companionAPI: CompanionAPI;
  }
}

export {};
