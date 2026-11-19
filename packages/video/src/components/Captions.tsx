import { useMemo, type ReactElement } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { WordTiming } from '@studio/shared/ace';
import { activeWordIndex, findActiveLine, groupCaptionLines } from '../captions/group-captions';
import { brand, layout } from '../theme';

/** Word-by-word captions on absolute composition time, kept clear of the TikTok UI bands. */
export function Captions({ words }: { words: readonly WordTiming[] }): ReactElement | null {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = useMemo(() => groupCaptionLines(words), [words]);
  const timeS = frame / fps;
  const line = findActiveLine(lines, timeS);

  if (!line) {
    return null;
  }

  const entrance = spring({
    frame: frame - Math.round(line.startS * fps),
    fps,
    config: { damping: 200 },
    durationInFrames: Math.round(0.2 * fps),
  });
  const active = activeWordIndex(line, timeS);

  return (
    <div
      style={{
        position: 'absolute',
        left: layout.left,
        right: layout.right,
        bottom: layout.captionsBottom,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          columnGap: 18,
          padding: '16px 28px',
          borderRadius: 22,
          backgroundColor: 'rgba(11, 20, 38, 0.82)',
          fontSize: 62,
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: -0.5,
          textShadow: '0 4px 18px rgba(0, 0, 0, 0.45)',
          opacity: entrance,
          translate: `0px ${interpolate(entrance, [0, 1], [14, 0])}px`,
        }}
      >
        {line.words.map((word, index) => (
          <span
            key={`${word.startS}-${index}`}
            style={{
              color: index === active ? brand.accent : index < active ? brand.text : 'rgba(244, 247, 251, 0.6)',
              scale: index === active ? '1.06' : '1',
            }}
          >
            {word.text.trim()}
          </span>
        ))}
      </div>
    </div>
  );
}
