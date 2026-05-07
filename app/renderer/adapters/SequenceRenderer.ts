import type { CompanionConfig, KeyframeDescriptor, StatesConfig } from '../../shared/types';

function keyframeFileName(folder: string): string {
  return `${folder}_01.png`;
}

export function buildKeyframes(
  companionConfig: CompanionConfig,
  statesConfig: StatesConfig
): KeyframeDescriptor[] {
  const assetRoot = companionConfig.renderer.assetRoot.replace(/\/+$/, '');

  return statesConfig.pa0KeyframeFolders.map((folder) => ({
    folder,
    state: statesConfig.idleVariants.includes(folder) ? 'idle' : folder,
    label: folder,
    relativePath: `${assetRoot}/keyframes/${folder}/${keyframeFileName(folder)}`
  }));
}
