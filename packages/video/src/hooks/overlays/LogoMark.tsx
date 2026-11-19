import type { ReactElement } from 'react';
import { interpolate } from 'remotion';
import { easeInOut, easeOut } from '../clock';
import { hookColors, motifColors, sansFont } from '../hook-theme';

const GRID = 34;

/**
 * The close that rhymes with the open: the four motif dots fly in from where the four
 * pills were and settle into a 2x2 mark beside the wordmark.
 */
export function LogoMark(props: { beat: number; dotsBeat: number; logoBeat: number; centerY?: number; scale?: number }): ReactElement {
  const { beat, dotsBeat, logoBeat, centerY = 760, scale = 1 } = props;
  const word = interpolate(beat, [logoBeat, logoBeat + 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const starts = [
    { x: -420, y: -520 },
    { x: 460, y: -380 },
    { x: -380, y: 560 },
    { x: 420, y: 480 },
  ];
  const targets = [
    { x: 0, y: 0 },
    { x: GRID, y: 0 },
    { x: 0, y: GRID },
    { x: GRID, y: GRID },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: centerY, height: 0, transform: `scale(${scale})`, transformOrigin: '540px 0px' }}>
      <div style={{ position: 'absolute', left: 540 - 250, top: -GRID / 2 - 8 }}>
        {motifColors.map((color, index) => {
          const at = dotsBeat + index * 0.5;
          const fly = interpolate(beat, [at, at + 1.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut });
          const start = starts[index] ?? { x: 0, y: 0 };
          const target = targets[index] ?? { x: 0, y: 0 };
          return (
            <div
              key={color}
              style={{
                position: 'absolute',
                left: start.x + (target.x - start.x) * fly,
                top: start.y + (target.y - start.y) * fly,
                width: 26,
                height: 26,
                borderRadius: 8,
                backgroundColor: color,
                opacity: interpolate(beat, [at, at + 0.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                boxShadow: `0 0 ${18 + (1 - fly) * 30}px ${color}`,
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: GRID * 2 + 28,
            top: -22,
            fontFamily: sansFont,
            fontSize: 104,
            fontWeight: 900,
            letterSpacing: -4,
            color: hookColors.text,
            whiteSpace: 'nowrap',
            opacity: word,
            transform: `translateX(${(1 - word) * -30}px)`,
            lineHeight: 1,
          }}
        >
          Engine<span style={{ color: hookColors.accent }}>OS</span>
        </div>
      </div>
    </div>
  );
}
