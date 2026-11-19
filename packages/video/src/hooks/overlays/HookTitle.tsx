import type { ReactElement } from 'react';
import { interpolate } from 'remotion';
import { easeOut } from '../clock';
import { normalizeWord } from './caption-chunks';
import { hookColors, sansFont } from '../hook-theme';

/** The 0-3 s hook: big words popping in on half beats, one word in the alarm colour. */
export function HookTitle(props: {
  text: string;
  highlight: string;
  beat: number;
  startBeat: number;
  endBeat: number;
  top?: number;
  fontSize?: number;
}): ReactElement | null {
  const { text, highlight, beat, startBeat, endBeat, top = 230, fontSize = 104 } = props;
  if (beat < startBeat || beat >= endBeat) return null;
  const words = text.split(/\s+/);
  const target = normalizeWord(highlight);
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 70,
        right: 150,
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 24,
        fontFamily: sansFont,
        fontSize,
        fontWeight: 900,
        lineHeight: 1.02,
        letterSpacing: -3,
      }}
    >
      {words.map((word, index) => {
        const at = startBeat + index * 0.35;
        const pop = interpolate(beat, [at, at + 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
        const isHighlight = normalizeWord(word) === target;
        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: 'inline-block',
              color: isHighlight ? hookColors.alarm : hookColors.text,
              opacity: pop,
              transform: `translateY(${(1 - pop) * 40}px) scale(${0.92 + pop * 0.08})`,
              filter: 'drop-shadow(0 6px 22px rgba(0, 0, 0, 0.6))',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}
