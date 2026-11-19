import { useMemo, type ReactElement } from 'react';
import { interpolate } from 'remotion';
import type { HookLine } from '@studio/shared/ace';
import { easeOut } from '../clock';
import { hookColors, sansFont } from '../hook-theme';
import { chunkLines, chunkWindow } from './caption-chunks';

/** Bottom of the caption band, above the TikTok UI (bottom safe zone 420 px). */
const CAPTION_BOTTOM_PX = 450;

/**
 * Short phrases, one idea at a time, at most two lines; words rise in as they are spoken
 * and the one highlighted word takes the accent colour.
 */
export function KineticCaption({ lines, timeS }: { lines: readonly HookLine[]; timeS: number }): ReactElement | null {
  const chunks = useMemo(() => chunkLines(lines), [lines]);
  const index = chunks.findIndex((_, candidate) => {
    const window = chunkWindow(chunks, candidate);
    return timeS >= window.fromS && timeS < window.toS;
  });
  const chunk = chunks[index];
  if (!chunk) return null;
  const window = chunkWindow(chunks, index);
  const exit = interpolate(timeS, [window.toS - 0.12, window.toS], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        right: 150,
        bottom: CAPTION_BOTTOM_PX,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignContent: 'flex-end',
        columnGap: 18,
        rowGap: 4,
        fontFamily: sansFont,
        fontSize: 66,
        fontWeight: 800,
        lineHeight: 1.12,
        letterSpacing: -1,
        opacity: exit,
      }}
    >
      {chunk.words.map((word, wordIndex) => {
        const appear = interpolate(timeS, [word.startS - 0.1, word.startS + 0.12], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: easeOut,
        });
        const isHighlight = word === chunk.highlightWord;
        const spoken = timeS >= word.startS;
        return (
          <span
            key={`${word.startS}-${wordIndex}`}
            style={{
              display: 'inline-block',
              color: isHighlight ? hookColors.accent : spoken ? hookColors.text : 'rgba(244, 247, 251, 0.35)',
              opacity: 0.35 + appear * 0.65,
              transform: `translateY(${(1 - appear) * 18}px) scale(${isHighlight ? 1 + appear * 0.06 : 1})`,
              // drop-shadow on the span, not text-shadow, keeps clean edges under transforms.
              filter: 'drop-shadow(0 4px 14px rgba(0, 0, 0, 0.7))',
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}
