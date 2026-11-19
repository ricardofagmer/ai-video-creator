import type { ReactElement } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { brand, hairline, layout } from '../theme';

export function ProgressBar(): ReactElement {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <div
      style={{
        position: 'absolute',
        top: layout.progressTop,
        left: layout.left,
        right: layout.right,
        height: 6,
        borderRadius: 3,
        backgroundColor: hairline,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          borderRadius: 3,
          backgroundColor: brand.accent,
          width: `${interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 100], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}%`,
        }}
      />
    </div>
  );
}
