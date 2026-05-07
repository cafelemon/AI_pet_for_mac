import type { ReactElement } from 'react';
import type { ReactNode } from 'react';

import type { CompanionState } from '../../shared/types';

interface BubbleProps {
  state: CompanionState;
  message: string | null;
  actions?: ReactNode;
}

export function Bubble({ state, message, actions }: BubbleProps): ReactElement | null {
  if (!message) {
    return null;
  }

  return (
    <div className={`status-bubble status-bubble--${state}`} data-hit-interactive="true">
      <div>{message}</div>
      {actions ? <div className="status-bubble__actions">{actions}</div> : null}
    </div>
  );
}
