import type { ReactElement } from 'react';

import type { KeyframeDescriptor } from '../../shared/types';

interface CompanionProps {
  keyframe: KeyframeDescriptor;
  canvas: {
    width: number;
    height: number;
  };
  draggable: boolean;
}

export function Companion({ keyframe, canvas, draggable }: CompanionProps): ReactElement {
  const imageUrl = window.companionAPI.assetUrl(keyframe.relativePath);

  return (
    <main className={draggable ? 'companion-shell companion-shell--draggable' : 'companion-shell'}>
      <img
        className="companion-image"
        src={imageUrl}
        width={canvas.width}
        height={canvas.height}
        alt=""
        draggable={false}
      />
    </main>
  );
}
