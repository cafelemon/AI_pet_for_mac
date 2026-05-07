import type { ReactElement } from 'react';

import type { CompanionState, KeyframeDescriptor, WindowControls } from '../../shared/types';

interface ScaleConfig {
  defaultScale: number;
  minScale: number;
  maxScale: number;
  scaleStep: number;
}

interface StatusPanelProps {
  open: boolean;
  states: CompanionState[];
  idleVariants: KeyframeDescriptor[];
  activeState: CompanionState;
  activeVariant: string | null;
  stateLabels: Record<CompanionState, string>;
  controls: WindowControls;
  scaleConfig: ScaleConfig;
  onSelectState: (state: CompanionState) => void;
  onSelectIdleVariant: (variantFolder: string) => void;
  onScaleDown: () => void;
  onScaleUp: () => void;
  onScaleReset: () => void;
  onTogglePassthrough?: () => void;
  onClose: () => void;
  showMouseModeToggle?: boolean;
}

function variantLabel(keyframe: KeyframeDescriptor): string {
  return keyframe.label.replace(/^idle_/, '').replace(/_/g, ' ');
}

export function StatusPanel({
  open,
  states,
  idleVariants,
  activeState,
  activeVariant,
  stateLabels,
  controls,
  scaleConfig,
  onSelectState,
  onSelectIdleVariant,
  onScaleDown,
  onScaleUp,
  onScaleReset,
  onTogglePassthrough,
  onClose,
  showMouseModeToggle = true
}: StatusPanelProps): ReactElement | null {
  if (!open) {
    return null;
  }

  const activeVariantKeyframe = activeVariant
    ? idleVariants.find((variant) => variant.folder === activeVariant)
    : undefined;
  const activeLabel = activeVariantKeyframe ? variantLabel(activeVariantKeyframe) : stateLabels[activeState];

  return (
    <section className="status-panel" aria-label="PA3 状态测试面板" data-hit-interactive="true">
      <header className="status-panel__header">
        <div>
          <p className="status-panel__eyebrow">PA3</p>
          <h1 className="status-panel__title">{activeLabel}</h1>
        </div>
        <button className="icon-button" type="button" aria-label="关闭面板" onClick={onClose}>
          x
        </button>
      </header>

      <div className="status-panel__group">
        <p className="status-panel__label">状态</p>
        <div className="status-panel__grid">
          {states.map((state) => (
            <button
              key={state}
              className={state === activeState && !activeVariant ? 'panel-button panel-button--active' : 'panel-button'}
              type="button"
              aria-pressed={state === activeState && !activeVariant}
              onClick={() => onSelectState(state)}
            >
              {stateLabels[state]}
            </button>
          ))}
        </div>
      </div>

      {idleVariants.length > 0 ? (
        <div className="status-panel__group">
          <p className="status-panel__label">Idle Variant</p>
          <div className="status-panel__grid">
            {idleVariants.map((variant) => (
              <button
                key={variant.folder}
                className={variant.folder === activeVariant ? 'panel-button panel-button--active' : 'panel-button'}
                type="button"
                aria-pressed={variant.folder === activeVariant}
                onClick={() => onSelectIdleVariant(variant.folder)}
              >
                {variantLabel(variant)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="status-panel__group">
        <p className="status-panel__label">窗口</p>
        <div className="scale-control">
          <button
            className="icon-button"
            type="button"
            aria-label="缩小窗口"
            disabled={controls.scale <= scaleConfig.minScale}
            onClick={onScaleDown}
          >
            -
          </button>
          <button className="scale-readout" type="button" onClick={onScaleReset}>
            {controls.scale.toFixed(2)}x
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="放大窗口"
            disabled={controls.scale >= scaleConfig.maxScale}
            onClick={onScaleUp}
          >
            +
          </button>
        </div>
        {showMouseModeToggle ? (
          <label className="passthrough-toggle">
            <input type="checkbox" checked={controls.mouseMode === 'smart'} onChange={onTogglePassthrough} />
            <span>{controls.mouseMode === 'smart' ? '智能穿透' : '整窗交互'}</span>
          </label>
        ) : null}
      </div>
    </section>
  );
}
