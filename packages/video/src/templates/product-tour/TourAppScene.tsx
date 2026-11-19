import type { ReactElement } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneVisual } from '../../components/SceneVisual';
import type { SceneSlot } from '../../components/scene-slots';
import { accentSoft, hairline, surfaceRaised } from '../../theme';
import { TourChip, TourProgress } from './TourChrome';
import { tourLayout } from './tour-layout';

interface TourAppSceneProps {
  slot: SceneSlot;
  /** 1-based position among the tour's app scenes. */
  number: number;
  total: number;
  disclosure: string;
}

/**
 * One app scene: the capture (or a bound image, or a typographic card) inside a framed card,
 * with a slow push-in on video, the chip above it and the free caption band below it.
 */
export function TourAppScene({ slot, number, total, disclosure }: TourAppSceneProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { card } = tourLayout;
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  // Images already push in inside SceneVisual; video gets the same gentle drift here.
  const drift =
    slot.scene.asset?.kind === 'video'
      ? interpolate(frame, [0, Math.max(1, slot.durationInFrames)], [1, 1.04], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      : 1;

  return (
    <AbsoluteFill>
      <TourChip number={number} text={slot.scene.onScreenText} />
      <TourProgress active={number} total={total} note={disclosure} />
      <div
        style={{
          position: 'absolute',
          left: card.left,
          top: card.top,
          width: card.width,
          height: card.height,
          borderRadius: 22,
          overflow: 'hidden',
          backgroundColor: surfaceRaised,
          border: `2px solid ${hairline}`,
          boxShadow: `0 40px 120px rgba(0, 0, 0, 0.55), 0 0 0 1px ${accentSoft}`,
          opacity: enter,
          transform: `scale(${0.94 + 0.06 * enter})`,
          transformOrigin: 'center top',
        }}
      >
        <div style={{ width: '100%', height: '100%', transform: `scale(${drift})`, transformOrigin: 'center center' }}>
          <SceneVisual
            asset={slot.scene.asset}
            fallbackText={slot.scene.onScreenText}
            durationInFrames={slot.durationInFrames}
            objectFit="contain"
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
