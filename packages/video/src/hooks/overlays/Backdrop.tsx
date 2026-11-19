import type { ReactElement } from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import type { HookTimeline } from '@studio/shared/ace';
import type { HookClock } from '../clock';
import { hookColors, sectionGlow } from '../hook-theme';

const CROSSFADE_BEATS = 0.75;

function glowFor(timeline: HookTimeline, clock: HookClock): { color: string; previous: string; mix: number } {
  const index = timeline.shots.findIndex((shot) => shot.id === clock.shotId);
  const shot = timeline.shots[index];
  const before = timeline.shots[index - 1];
  const color = sectionGlow[shot?.section ?? 'intro'];
  const previous = before ? sectionGlow[before.section] : color;
  const mix = shot ? interpolate(clock.beat, [shot.startBeat, shot.startBeat + CROSSFADE_BEATS], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return { color, previous, mix };
}

/** Dark base, a section-coloured glow that breathes, vignette and moving film grain. */
export function Backdrop({ timeline, clock, intensity = 1 }: { timeline: HookTimeline; clock: HookClock; intensity?: number }): ReactElement {
  const { color, previous, mix } = glowFor(timeline, clock);
  const pulse = 0.85 + Math.sin(clock.beat * Math.PI) * 0.05;
  const silent = clock.section === 'silence' ? 0.35 : 1;
  const grainX = Math.floor(random(`grain-x-${clock.frame}`) * 200);
  const grainY = Math.floor(random(`grain-y-${clock.frame}`) * 200);
  return (
    <AbsoluteFill style={{ backgroundColor: hookColors.background, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          opacity: (1 - mix) * 0.55 * pulse * intensity * silent,
          background: `radial-gradient(ellipse 85% 55% at 50% 42%, ${previous} 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: mix * 0.55 * pulse * intensity * silent,
          background: `radial-gradient(ellipse 85% 55% at 50% 42%, ${color} 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.65) 100%)' }} />
      <svg width="1400" height="2300" style={{ position: 'absolute', left: -grainX, top: -grainY, opacity: 0.07, mixBlendMode: 'overlay' }}>
        <filter id="hook-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={clock.frame % 17} />
        </filter>
        <rect width="100%" height="100%" filter="url(#hook-grain)" />
      </svg>
    </AbsoluteFill>
  );
}
