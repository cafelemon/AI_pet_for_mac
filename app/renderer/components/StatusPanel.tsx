import type { ReactElement } from 'react';

import type { CompanionState, KeyframeDescriptor, WindowControls } from '../../shared/types';

export interface StatusActionGroup {
  label: string;
  actions: KeyframeDescriptor[];
}

interface ScaleConfig {
  defaultScale: number;
  minScale: number;
  maxScale: number;
  scaleStep: number;
}

interface StatusPanelProps {
  open: boolean;
  actionGroups: StatusActionGroup[];
  activeState: CompanionState;
  activeFolder: string | null;
  stateLabels: Record<CompanionState, string>;
  controls: WindowControls;
  scaleConfig: ScaleConfig;
  onSelectAction: (action: KeyframeDescriptor) => void;
  onScaleDown: () => void;
  onScaleUp: () => void;
  onScaleReset: () => void;
  onTogglePassthrough?: () => void;
  onClose: () => void;
  showMouseModeToggle?: boolean;
}

function variantLabel(keyframe: KeyframeDescriptor): string {
  return keyframe.label.replace(/^idle_/, '').replace(/^duck_sit_/, 'duck sit ').replace(/_/g, ' ');
}

export function StatusPanel({
  open,
  actionGroups,
  activeState,
  activeFolder,
  stateLabels,
  controls,
  scaleConfig,
  onSelectAction,
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

  const activeAction = actionGroups
    .flatMap((group) => group.actions)
    .find((action) => action.folder === activeFolder);
  const activeLabel = activeAction ? variantLabel(activeAction) : stateLabels[activeState];

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

      {actionGroups.map((group) => (
        <div className="status-panel__group" key={group.label}>
          <p className="status-panel__label">{group.label}</p>
          <div className="status-panel__grid">
            {group.actions.map((action) => (
              <button
                key={action.folder}
                className={action.folder === activeFolder ? 'panel-button panel-button--active' : 'panel-button'}
                type="button"
                aria-pressed={action.folder === activeFolder}
                onClick={() => onSelectAction(action)}
              >
                {variantLabel(action)}
              </button>
            ))}
          </div>
        </div>
      ))}

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
