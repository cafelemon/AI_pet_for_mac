import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';

import type { CompanionState, KeyframeDescriptor, MouseHitRegion } from '../../shared/types';

interface CompanionProps {
  keyframe: KeyframeDescriptor;
  canvas: {
    width: number;
    height: number;
  };
  state: CompanionState;
  onHitTesterChange: (hitTester: ((x: number, y: number) => boolean) | null) => void;
  onHitRegionsChange: (regions: MouseHitRegion[]) => void;
}

const ALPHA_HIT_THRESHOLD = 16;
const ALPHA_REGION_BAND_HEIGHT = 3;

type VideoStatus = 'loading' | 'ready' | 'failed';

function regionFromMediaBounds(element: HTMLElement): MouseHitRegion {
  const rect = element.getBoundingClientRect();

  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function buildAlphaHitRegions(
  element: HTMLElement,
  context: CanvasRenderingContext2D,
  sourceWidth: number,
  sourceHeight: number
): MouseHitRegion[] {
  const rect = element.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width));
  const cssHeight = Math.max(1, Math.round(rect.height));
  const imageData = context.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const sourceXToCssX = new Uint16Array(sourceWidth);
  const regions: MouseHitRegion[] = [];

  for (let sourceX = 0; sourceX < sourceWidth; sourceX += 1) {
    sourceXToCssX[sourceX] = Math.min(cssWidth - 1, Math.floor((sourceX / sourceWidth) * cssWidth));
  }

  for (let bandTop = 0; bandTop < cssHeight; bandTop += ALPHA_REGION_BAND_HEIGHT) {
    const bandHeight = Math.min(ALPHA_REGION_BAND_HEIGHT, cssHeight - bandTop);
    const sourceYStart = Math.floor((bandTop / cssHeight) * sourceHeight);
    const sourceYEnd = Math.min(sourceHeight, Math.ceil(((bandTop + bandHeight) / cssHeight) * sourceHeight));
    const opaqueColumns = new Uint8Array(cssWidth);

    for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
      const rowOffset = sourceY * sourceWidth * 4;

      for (let sourceX = 0; sourceX < sourceWidth; sourceX += 1) {
        if (imageData[rowOffset + sourceX * 4 + 3] > ALPHA_HIT_THRESHOLD) {
          opaqueColumns[sourceXToCssX[sourceX]] = 1;
        }
      }
    }

    let runStart = -1;
    for (let cssX = 0; cssX <= cssWidth; cssX += 1) {
      if (cssX < cssWidth && opaqueColumns[cssX] === 1) {
        if (runStart === -1) {
          runStart = cssX;
        }
        continue;
      }

      if (runStart !== -1) {
        const regionLeft = Math.max(0, Math.round(rect.left + runStart - 1));
        const regionRight = Math.min(Math.ceil(rect.right), Math.round(rect.left + cssX + 1));
        regions.push({
          x: regionLeft,
          y: Math.max(0, Math.round(rect.top + bandTop)),
          width: Math.max(1, regionRight - regionLeft),
          height: bandHeight
        });
        runStart = -1;
      }
    }
  }

  return regions;
}

export function Companion({
  keyframe,
  canvas,
  state,
  onHitTesterChange,
  onHitRegionsChange
}: CompanionProps): ReactElement {
  const mediaFrameRef = useRef<HTMLDivElement | null>(null);
  const maskImageRef = useRef<HTMLImageElement | null>(null);
  const fallbackRelativePath = keyframe.fallbackRelativePath ?? keyframe.relativePath;
  const fallbackAssetUrl = window.companionAPI.assetUrl(fallbackRelativePath);
  const videoAssetUrl = window.companionAPI.assetUrl(keyframe.webmRelativePath);
  const [fallbackDisplayUrl, setFallbackDisplayUrl] = useState(fallbackAssetUrl);
  const [videoStatus, setVideoStatus] = useState<VideoStatus>('loading');
  const buildHitTester = useCallback((): void => {
    const image = maskImageRef.current;
    const mediaFrame = mediaFrameRef.current;
    if (
      !image ||
      !mediaFrame ||
      !image.complete ||
      image.naturalWidth === 0 ||
      image.naturalHeight === 0
    ) {
      onHitTesterChange(null);
      return;
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = image.naturalWidth;
    maskCanvas.height = image.naturalHeight;
    const context = maskCanvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      onHitTesterChange(null);
      return;
    }

    try {
      context.drawImage(image, 0, 0, maskCanvas.width, maskCanvas.height);
      onHitRegionsChange(buildAlphaHitRegions(mediaFrame, context, maskCanvas.width, maskCanvas.height));
      onHitTesterChange((x: number, y: number): boolean => {
        const rect = mediaFrame.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          return false;
        }

        const imageX = Math.floor(((x - rect.left) / rect.width) * maskCanvas.width);
        const imageY = Math.floor(((y - rect.top) / rect.height) * maskCanvas.height);
        const clampedX = Math.min(Math.max(imageX, 0), maskCanvas.width - 1);
        const clampedY = Math.min(Math.max(imageY, 0), maskCanvas.height - 1);
        return context.getImageData(clampedX, clampedY, 1, 1).data[3] > ALPHA_HIT_THRESHOLD;
      });
    } catch (error) {
      console.warn('Falling back to keyframe bounds hit testing.', error);
      onHitRegionsChange([regionFromMediaBounds(mediaFrame)]);
      onHitTesterChange((x: number, y: number): boolean => {
        const rect = mediaFrame.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      });
    }
  }, [onHitRegionsChange, onHitTesterChange]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setFallbackDisplayUrl(fallbackAssetUrl);

    fetch(fallbackAssetUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Fallback keyframe request failed with ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setFallbackDisplayUrl(objectUrl);
      })
      .catch((error: unknown) => {
        console.warn('Falling back to direct keyframe URL.', error);
        if (!cancelled) {
          setFallbackDisplayUrl(fallbackAssetUrl);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fallbackAssetUrl]);

  useEffect(() => {
    setVideoStatus('loading');
  }, [keyframe.webmRelativePath]);

  useEffect(() => {
    onHitTesterChange(null);
    onHitRegionsChange([]);
    if (maskImageRef.current?.complete) {
      buildHitTester();
    }
    return () => {
      onHitTesterChange(null);
      onHitRegionsChange([]);
    };
  }, [buildHitTester, fallbackRelativePath, onHitRegionsChange, onHitTesterChange]);

  const handleVideoCanPlay = useCallback((event: SyntheticEvent<HTMLVideoElement>): void => {
    const video = event.currentTarget;
    setVideoStatus('ready');
    video.play().catch((error: unknown) => {
      console.warn('Transparent WebM playback failed; using fallback keyframe.', error);
      setVideoStatus('failed');
    });
  }, []);

  const handleVideoError = useCallback((): void => {
    setVideoStatus('failed');
  }, []);

  return (
    <div ref={mediaFrameRef} className={`companion-media-frame companion-media-frame--${state}`}>
      <video
        className={
          videoStatus === 'ready'
            ? `companion-media companion-video companion-video--ready`
            : 'companion-media companion-video companion-video--loading'
        }
        src={videoAssetUrl}
        width={canvas.width}
        height={canvas.height}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        onCanPlay={handleVideoCanPlay}
        onError={handleVideoError}
      />
      <img
        ref={maskImageRef}
        className={
          videoStatus === 'ready'
            ? 'companion-mask-image'
            : `companion-media companion-image companion-media--${state}`
        }
        src={fallbackDisplayUrl}
        width={canvas.width}
        height={canvas.height}
        alt=""
        draggable={false}
        onLoad={buildHitTester}
      />
    </div>
  );
}
