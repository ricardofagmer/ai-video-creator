import type { ReactElement } from 'react';
import { interpolate } from 'remotion';
import { easeInOut } from '../clock';

/**
 * A real pointer: eases from `from` to `to` (screen px), clicks at `clickBeat` with a ripple,
 * then fades out. Positions are screen space because the camera moves under it.
 */
export function Cursor(props: {
  beat: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  moveStartBeat: number;
  clickBeat: number;
  hideBeat: number;
}): ReactElement | null {
  const { beat, from, to, moveStartBeat, clickBeat, hideBeat } = props;
  if (beat < moveStartBeat || beat > hideBeat + 0.5) return null;
  const travel = interpolate(beat, [moveStartBeat, clickBeat - 0.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut });
  const x = from.x + (to.x - from.x) * travel;
  const y = from.y + (to.y - from.y) * travel;
  const press = beat >= clickBeat && beat < clickBeat + 0.25 ? 0.86 : 1;
  const ripple = interpolate(beat, [clickBeat, clickBeat + 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fade = interpolate(beat, [hideBeat, hideBeat + 0.5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const appear = interpolate(beat, [moveStartBeat, moveStartBeat + 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: fade * appear }}>
      {beat >= clickBeat ? (
        <div
          style={{
            position: 'absolute',
            left: to.x - 60 * ripple,
            top: to.y - 60 * ripple,
            width: 120 * ripple,
            height: 120 * ripple,
            borderRadius: '50%',
            border: '4px solid rgba(255, 255, 255, 0.85)',
            opacity: 1 - ripple,
          }}
        />
      ) : null}
      <svg
        width="56"
        height="72"
        viewBox="0 0 28 36"
        style={{ position: 'absolute', left: x - 6, top: y - 4, transform: `scale(${press})`, transformOrigin: '6px 4px', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))' }}
      >
        <path d="M3 2 L3 28 L10 21 L15 33 L20 31 L15 19 L25 19 Z" fill="#FFFFFF" stroke="#0B1426" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
