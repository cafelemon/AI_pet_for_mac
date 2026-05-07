import type { CompanionConfig, KeyframeDescriptor, StatesConfig } from '../../shared/types';

function keyframeFileName(folder: string): string {
  return `${folder}_01.png`;
}

function webmFileName(folder: string): string {
  return `${folder}_loop.webm`;
}

export function buildKeyframes(
  companionConfig: CompanionConfig,
  statesConfig: StatesConfig
): KeyframeDescriptor[] {
  const assetRoot = companionConfig.renderer.assetRoot.replace(/\/+$/, '');
  const keyframeRoot = (companionConfig.renderer.keyframeRoot ?? 'keyframes').replace(/^\/+|\/+$/g, '');
  const webmRoot = (companionConfig.renderer.webmRoot ?? 'webm').replace(/^\/+|\/+$/g, '');

  return statesConfig.pa0KeyframeFolders.map((folder) => ({
    folder,
    state: statesConfig.idleVariants.includes(folder) ? 'idle' : folder,
    label: folder,
    webmRelativePath: `${assetRoot}/${webmRoot}/${folder}/${webmFileName(folder)}`,
    fallbackRelativePath: `${assetRoot}/${keyframeRoot}/${folder}/${keyframeFileName(folder)}`,
    relativePath: `${assetRoot}/${keyframeRoot}/${folder}/${keyframeFileName(folder)}`
  }));
}
