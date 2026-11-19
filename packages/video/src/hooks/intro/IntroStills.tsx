import type { ReactElement } from 'react';
import { AbsoluteFill } from 'remotion';
import type { HookRenderInput } from '@studio/shared/ace';
import { copyText, createClock, shotStart } from '../clock';
import { hookColors, motifColors, sansFont } from '../hook-theme';
import { Backdrop } from '../overlays/Backdrop';
import { normalizeWord } from '../overlays/caption-chunks';
import { Avatar, restingPose } from './Avatar';

/** A friendly, settled expression for stills: eyes to camera, mouth closed, slight tilt. */
const stillPose = { ...restingPose, tiltDeg: -2, breath: 0.5 };

function BrandChip({ top, left }: { top: number; left: number }): ReactElement {
  return (
    <div style={{ position: 'absolute', top, left, display: 'flex', alignItems: 'center', gap: 12, fontSize: 34, fontWeight: 800, color: hookColors.text }}>
      <div style={{ display: 'grid', gridTemplateColumns: '14px 14px', gap: 5 }}>
        {motifColors.map((color) => (
          <div key={color} style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color }} />
        ))}
      </div>
      <span>
        Engine<span style={{ color: hookColors.accent }}>OS</span>
      </span>
    </div>
  );
}

/** 9:16 cover: the hook line over Ricardo, readable as a thumbnail. */
export function IntroCover(input: HookRenderInput): ReactElement {
  const clock = createClock(input, Math.round(shotStart(input, 'who') * input.beatS * input.fps) + 10);
  const target = normalizeWord(copyText(input, 'hookHighlight'));
  return (
    <AbsoluteFill style={{ fontFamily: sansFont }}>
      <Backdrop timeline={input} clock={clock} intensity={1.2} />
      <BrandChip top={200} left={70} />
      <div style={{ position: 'absolute', top: 290, left: 70, fontSize: 40, fontWeight: 700, color: hookColors.accent }}>{copyText(input, 'coverKicker')}</div>
      <div style={{ position: 'absolute', top: 350, left: 70, right: 150, fontSize: 132, fontWeight: 900, lineHeight: 1, letterSpacing: -4, color: hookColors.text }}>
        {copyText(input, 'hook')
          .split(/\s+/)
          .map((word, index) => (
            <span key={`${word}-${index}`} style={{ color: normalizeWord(word) === target ? hookColors.alarm : hookColors.text }}>
              {index > 0 ? ' ' : ''}
              {word}
            </span>
          ))}
      </div>
      <div style={{ position: 'absolute', left: 130, top: 680, filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.5))' }}>
        <Avatar pose={stillPose} width={820} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 460, background: 'linear-gradient(rgba(7,12,24,0) 0%, rgba(7,12,24,0.92) 55%)' }} />
      <div style={{ position: 'absolute', left: 70, right: 150, bottom: 170, textAlign: 'center' }}>
        <div style={{ fontSize: 56, fontWeight: 900, color: hookColors.text }}>{copyText(input, 'name')}</div>
        <div style={{ fontSize: 34, fontWeight: 600, color: hookColors.accent, marginTop: 6 }}>{copyText(input, 'role')}</div>
      </div>
    </AbsoluteFill>
  );
}

/** Square profile picture: Ricardo on a teal glow, head and shoulders. */
export function IntroAvatarStill(): ReactElement {
  return (
    <AbsoluteFill style={{ backgroundColor: hookColors.background, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, ${hookColors.accent} 0%, rgba(46,196,182,0.35) 38%, transparent 70%)`, opacity: 0.75 }} />
      <div style={{ position: 'absolute', left: 110, top: 40, filter: 'drop-shadow(0 24px 50px rgba(0,0,0,0.45))' }}>
        <Avatar pose={stillPose} width={860} />
      </div>
    </AbsoluteFill>
  );
}
