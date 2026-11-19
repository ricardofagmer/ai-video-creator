import type { ReactElement, ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { brand, layout } from '../theme';

interface OnScreenTextProps {
  text: string;
  /** Small label above the headline, e.g. a step badge or the scene kind. */
  eyebrow?: ReactNode;
  fontSize?: number;
}

/** Headline that rises in with a damped spring and an accent rule that draws underneath. */
export function OnScreenText({ text, eyebrow, fontSize = 68 }: OnScreenTextProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(0.6 * fps) });

  return (
    <div
      style={{
        position: 'absolute',
        top: layout.headerTop,
        left: layout.left,
        right: layout.right,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        opacity: entrance,
        translate: `0px ${interpolate(entrance, [0, 1], [28, 0])}px`,
      }}
    >
      {eyebrow}
      <div style={{ fontSize, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1, color: brand.text }}>{text}</div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: brand.accent,
          width: interpolate(frame, [0.15 * fps, 0.75 * fps], [0, 160], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      />
    </div>
  );
}

/** Pill label used as the OnScreenText eyebrow. */
export function KindLabel({ children, filled = false }: { children: ReactNode; filled?: boolean }): ReactElement {
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        padding: '8px 18px',
        borderRadius: 999,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: filled ? brand.background : brand.accent,
        backgroundColor: filled ? brand.accent : 'transparent',
        border: `2px solid ${brand.accent}`,
      }}
    >
      {children}
    </div>
  );
}
