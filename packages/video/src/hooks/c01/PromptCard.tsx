import type { ReactElement } from 'react';
import { hookColors, monoFont } from '../hook-theme';
import { world } from './world';

export interface PromptCardProps {
  command: string;
  /** e.g. "git push": what the guard names in its [engineos] line. */
  guardVerb: string;
  /** 0..1 entrance. */
  appear: number;
  /** 0..1 press on "1. Yes" (darkens and shrinks, never lightens). */
  press: number;
  /** 0..1 alarm glow around the card. */
  alarm: number;
  left: number;
  top: number;
  scale?: number;
}

/** The Claude Code permission dialog, with the EngineOS guard line in it. */
export function PromptCard(props: PromptCardProps): ReactElement {
  const { command, guardVerb, appear, press, alarm, left, top, scale = 1 } = props;
  const fontSize = world.fontSize;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: world.card.w,
        height: world.card.h,
        boxSizing: 'border-box',
        padding: '22px 30px',
        borderRadius: 18,
        border: `3px solid ${hookColors.amber}`,
        backgroundColor: '#121F38',
        fontFamily: monoFont,
        fontSize,
        lineHeight: 1.5,
        color: hookColors.text,
        opacity: appear,
        transform: `translateY(${(1 - appear) * 40}px) scale(${scale * (0.94 + appear * 0.06)})`,
        transformOrigin: 'top left',
        boxShadow: `0 0 ${20 + alarm * 70}px rgba(255, 90, 95, ${0.25 + alarm * 0.55}), 0 24px 60px rgba(0,0,0,0.5)`,
      }}
    >
      <div style={{ color: hookColors.amber, fontWeight: 700 }}>Bash command</div>
      <div style={{ paddingLeft: 28, whiteSpace: 'nowrap' }}>{command}</div>
      <div style={{ paddingLeft: 28, color: hookColors.alarm, fontWeight: 700, whiteSpace: 'nowrap' }}>
        [engineos] git write: {guardVerb}
      </div>
      <div style={{ marginTop: 6 }}>Do you want to proceed?</div>
      <div style={{ position: 'relative', height: 48 }}>
        <div
          style={{
            position: 'absolute',
            left: world.yesOption.x - 30,
            top: 0,
            width: world.yesOption.w,
            height: world.yesOption.h,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 12,
            boxSizing: 'border-box',
            backgroundColor: `rgba(46, 196, 182, ${0.22 + press * 0.25})`,
            filter: `brightness(${1 - press * 0.35})`,
            transform: `scale(${1 - press * 0.06})`,
            transformOrigin: 'left center',
            color: hookColors.text,
            fontWeight: 700,
          }}
        >
          {'❯'} 1. Yes
        </div>
        <div style={{ position: 'absolute', left: world.yesOption.w + 6, top: 6, color: hookColors.dim, whiteSpace: 'nowrap' }}>2. No (esc)</div>
      </div>
    </div>
  );
}
