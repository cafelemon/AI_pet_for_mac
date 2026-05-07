import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { Companion } from '../components/Companion';
import { buildKeyframes } from '../adapters/SequenceRenderer';
import type { CompanionConfig, KeyframeDescriptor, StatesConfig } from '../../shared/types';

function findDefaultIndex(keyframes: KeyframeDescriptor[], defaultState: string): number {
  const index = keyframes.findIndex((keyframe) => keyframe.state === defaultState);
  return index >= 0 ? index : 0;
}

export function App(): ReactElement | null {
  const [companionConfig, setCompanionConfig] = useState<CompanionConfig | null>(null);
  const [statesConfig, setStatesConfig] = useState<StatesConfig | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig(): Promise<void> {
      const [nextCompanionConfig, nextStatesConfig] = await Promise.all([
        window.companionAPI.getCompanionConfig(),
        window.companionAPI.getStatesConfig()
      ]);

      if (!cancelled) {
        setCompanionConfig(nextCompanionConfig);
        setStatesConfig(nextStatesConfig);
      }
    }

    loadConfig().catch((error: unknown) => {
      console.error('Failed to load companion config', error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const keyframes = useMemo(() => {
    if (!companionConfig || !statesConfig) {
      return [];
    }

    return buildKeyframes(companionConfig, statesConfig);
  }, [companionConfig, statesConfig]);

  useEffect(() => {
    if (!companionConfig || keyframes.length === 0) {
      return;
    }

    setActiveIndex(findDefaultIndex(keyframes, companionConfig.renderer.defaultState));
  }, [companionConfig, keyframes]);

  useEffect(() => {
    if (!companionConfig || keyframes.length === 0) {
      return undefined;
    }

    const defaultState = companionConfig.renderer.defaultState;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'ArrowRight') {
        setActiveIndex((index) => (index + 1) % keyframes.length);
      } else if (event.key === 'ArrowLeft') {
        setActiveIndex((index) => (index - 1 + keyframes.length) % keyframes.length);
      } else if (event.key === 'Escape') {
        setActiveIndex(findDefaultIndex(keyframes, defaultState));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [companionConfig, keyframes]);

  if (!companionConfig || keyframes.length === 0) {
    return null;
  }

  const activeKeyframe = keyframes[activeIndex] ?? keyframes[0];

  return (
    <Companion
      keyframe={activeKeyframe}
      canvas={companionConfig.renderer.keyframeCanvas}
      draggable={companionConfig.window.draggable}
    />
  );
}
