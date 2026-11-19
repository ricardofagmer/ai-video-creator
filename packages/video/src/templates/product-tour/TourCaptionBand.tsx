import { useMemo, type ReactElement } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { WordTiming } from '@studio/shared/ace';
import { activeWordIndex, findActiveLine, groupCaptionLines } from '../../captions/group-captions';
import { brand } from '../../theme';
import { tourLayout } from './tour-layout';

/**
 * The band below the app. In a run it stays empty: R1-14 renders with `captions: []` and the
 * `captions` stage burns them into this band afterwards. Studio previews pass word timings, so the
 * band shows where the burned line will sit.
 */
export function TourCaptionBand({ words }: { words: readonly WordTiming[] }): ReactElement | null {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = useMemo(() => groupCaptionLines(words), [words]);
  const timeS = frame / fps;
  const line = findActiveLine(lines, timeS);
  if (!line) return null;
  const active = activeWordIndex(line, timeS);

  return (
    <div
      style={{
        position: 'absolute',
        left: tourLayout.sideInset,
        right: tourLayout.sideInset,
        top: tourLayout.captionBand.top,
        height: tourLayout.captionBand.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          columnGap: 14,
          padding: '10px 26px 8px',
          borderRadius: 10,
          borderLeft: `5px solid ${brand.accent}`,
          backgroundColor: `${brand.background}E0`,
          fontWeight: 700,
          fontSize: 44,
          lineHeight: 1.15,
        }}
      >
        {line.words.map((word, index) => (
          <span key={`${word.startS}-${index}`} style={{ color: index === active ? brand.accent : brand.text }}>
            {word.text.trim()}
          </span>
        ))}
      </div>
    </div>
  );
}
