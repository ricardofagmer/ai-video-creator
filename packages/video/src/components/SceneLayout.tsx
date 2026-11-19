import type { ReactElement, ReactNode } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { brand, hairline, layout, surface } from '../theme';
import { OnScreenText } from './OnScreenText';

interface SceneLayoutProps {
  headline: string;
  eyebrow?: ReactNode;
  headlineSize?: number;
  /** Visual for the media band between the headline and the captions. */
  children: ReactNode;
}

/** Standard scene: headline band on top, media band in the middle, captions band left free. */
export function SceneLayout({ headline, eyebrow, headlineSize, children }: SceneLayoutProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [0, 0.25 * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    >
      <OnScreenText text={headline} eyebrow={eyebrow} fontSize={headlineSize} />
      <div
        style={{
          position: 'absolute',
          top: layout.mediaTop,
          bottom: layout.mediaBottom,
          left: layout.left,
          right: layout.right,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}

interface HeroLayoutProps {
  text: string;
  eyebrow?: ReactNode;
  /** Optional template visual rendered under the text (scoreboard rows, node flow). */
  children?: ReactNode;
}

/** Typographic scene for asset-less scenes: one large card spanning the headline and media bands. */
export function HeroLayout({ text, eyebrow, children }: HeroLayoutProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(0.7 * fps) });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: layout.headerTop,
          bottom: layout.mediaBottom,
          left: layout.left,
          right: layout.right,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 40,
          padding: 56,
          boxSizing: 'border-box',
          borderRadius: 36,
          border: `2px solid ${hairline}`,
          background: `linear-gradient(165deg, ${surface} 0%, ${brand.background} 100%)`,
          opacity: entrance,
          scale: interpolate(entrance, [0, 1], [0.97, 1]),
        }}
      >
        {eyebrow}
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.06, letterSpacing: -2, color: brand.text }}>
          {text}
        </div>
        {children}
      </div>
    </AbsoluteFill>
  );
}
