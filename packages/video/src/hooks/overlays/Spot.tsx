import type { ReactElement } from 'react';
import { hookColors } from '../hook-theme';

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Focus: darkens everything but one region, which keeps an outline; context stays visible. */
export function Spot({ rect, amount }: { rect: ScreenRect; amount: number }): ReactElement | null {
  if (amount <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: 22,
        boxShadow: `0 0 0 4000px rgba(5, 10, 20, ${0.6 * amount})`,
        outline: `3px solid rgba(46, 196, 182, ${0.7 * amount})`,
        outlineOffset: 2,
        pointerEvents: 'none',
        color: hookColors.text,
      }}
    />
  );
}
