import type { ReactElement } from 'react';
import { Img, OffthreadVideo, interpolate, useCurrentFrame } from 'remotion';
import type { RenderScene } from '@studio/shared/ace';
import { brand, hairline, surface } from '../theme';

interface SceneVisualProps {
  asset: RenderScene['asset'];
  /** Text for the typographic card shown when the scene has no asset. */
  fallbackText: string;
  durationInFrames: number;
  objectFit?: 'cover' | 'contain';
}

/** Scene asset: image with a slow push-in, muted video, or a typographic card when asset is null. */
export function SceneVisual({ asset, fallbackText, durationInFrames, objectFit = 'cover' }: SceneVisualProps): ReactElement {
  if (!asset) {
    return <TypographicCard text={fallbackText} />;
  }
  if (asset.kind === 'video') {
    return <OffthreadVideo src={asset.url} muted style={{ width: '100%', height: '100%', objectFit }} />;
  }
  return <PushInImage src={asset.url} durationInFrames={durationInFrames} objectFit={objectFit} />;
}

function PushInImage({
  src,
  durationInFrames,
  objectFit,
}: {
  src: string;
  durationInFrames: number;
  objectFit: 'cover' | 'contain';
}): ReactElement {
  const frame = useCurrentFrame();

  return (
    <Img
      src={src}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        scale: interpolate(frame, [0, Math.max(1, durationInFrames)], [1, 1.06], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      }}
    />
  );
}

function TypographicCard({ text }: { text: string }): ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 56,
        boxSizing: 'border-box',
        background: `linear-gradient(160deg, ${surface} 0%, ${brand.background} 100%)`,
        border: `2px solid ${hairline}`,
        borderRadius: 32,
      }}
    >
      <div
        style={{
          fontSize: 76,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: -1.5,
          textAlign: 'center',
          color: brand.text,
        }}
      >
        {text}
      </div>
    </div>
  );
}
