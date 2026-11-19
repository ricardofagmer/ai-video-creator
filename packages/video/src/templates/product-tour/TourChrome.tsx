import type { ReactElement } from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { accentSoft, brand, hairline, surface } from '../../theme';
import { tourLayout } from './tour-layout';

/** Slow-moving glow over the brand background (Spesia `Backdrop`). */
export function TourBackdrop(): ReactElement {
  const frame = useCurrentFrame();
  const glowX = 50 + 18 * Math.sin(frame / 140);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${glowX}% 30%, ${accentSoft}, transparent 55%), linear-gradient(160deg, ${surface}, ${brand.background})`,
      }}
    />
  );
}

/** Two-digit step number, a hairline divider and the scene's on-screen text (Spesia `Chip`). */
export function TourChip({ number, text }: { number: number; text: string }): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: tourLayout.sideInset,
        top: tourLayout.headerTop,
        maxWidth: tourLayout.card.width * 0.62,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        opacity: enter,
        transform: `translateX(${(1 - enter) * -60}px)`,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 44, color: brand.accent, letterSpacing: -1 }}>{String(number).padStart(2, '0')}</div>
      <div style={{ width: 3, height: 54, backgroundColor: hairline, borderRadius: 2 }} />
      <div
        style={{
          fontWeight: 700,
          fontSize: 36,
          lineHeight: 1.1,
          color: brand.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </div>
    </div>
  );
}

/** One dot per app scene, the active one wide, and the disclosure under it (Spesia `Progress`). */
export function TourProgress({ active, total, note }: { active: number; total: number; note: string }): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        right: tourLayout.sideInset,
        top: tourLayout.headerTop + 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        {Array.from({ length: total }, (_unused, index) => (
          <div
            key={index}
            style={{
              width: index + 1 === active ? 46 : 22,
              height: 7,
              borderRadius: 4,
              backgroundColor: index + 1 <= active ? brand.accent : hairline,
            }}
          />
        ))}
      </div>
      {note.trim() === '' ? null : <div style={{ fontWeight: 500, fontSize: 18, color: brand.muted }}>{note}</div>}
    </div>
  );
}
