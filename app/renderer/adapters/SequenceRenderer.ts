import type { CompanionConfig, KeyframeDescriptor, MotionConfig, StatesConfig } from '../../shared/types';

const DEFAULT_MOTION: MotionConfig = {
  playback: 'loop',
  durationMs: 4000
};

function keyframeFileName(folder: string): string {
  return `${folder}_01.png`;
}

function webmFileName(folder: string): string {
  return `${folder}_loop.webm`;
}

function sourceVideoFiles(folder: string): string[] {
  return [
    `${folder}_jimeng.mp4`,
    `${folder}_kling.mp4`,
    `jimeng_${folder}.mp4`,
    `kling_${folder}.mp4`,
    `${folder}_source.mp4`
  ];
}

function motionForFolder(folder: string, statesConfig: StatesConfig): MotionConfig {
  return statesConfig.motions?.[folder] ?? DEFAULT_MOTION;
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
    motion: motionForFolder(folder, statesConfig),
    webmRelativePath: `${assetRoot}/${webmRoot}/${folder}/${webmFileName(folder)}`,
    sourceVideoRelativePaths: sourceVideoFiles(folder).map((file) => `${assetRoot}/states/${folder}/source/${file}`),
    sourceVideoRelativePath: `${assetRoot}/states/${folder}/source/${folder}_jimeng.mp4`,
    fallbackRelativePath: `${assetRoot}/${keyframeRoot}/${folder}/${keyframeFileName(folder)}`,
    relativePath: `${assetRoot}/${keyframeRoot}/${folder}/${keyframeFileName(folder)}`
  }));
}
