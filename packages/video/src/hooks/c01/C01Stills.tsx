import type { ReactElement, ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import type { HookRenderInput } from '@studio/shared/ace';
import { copyText, createClock, shotStart } from '../clock';
import { hookColors, monoFont, motifColors, sansFont } from '../hook-theme';
import { Backdrop } from '../overlays/Backdrop';
import { LogoMark } from '../overlays/LogoMark';
import { Pill } from '../overlays/Pill';
import { normalizeWord } from '../overlays/caption-chunks';
import { PromptCard } from './PromptCard';
import { RulePanel } from './RulePanel';
import { commands, world } from './world';

const SETTLED = 1000;

function Highlighted({ text, highlight, color }: { text: string; highlight: string; color: string }): ReactElement {
  const target = normalizeWord(highlight);
  return (
    <>
      {text.split(/\s+/).map((word, index) => (
        <span key={`${word}-${index}`} style={{ color: normalizeWord(word) === target ? color : hookColors.text }}>
          {index > 0 ? ' ' : ''}
          {word}
        </span>
      ))}
    </>
  );
}

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

/** 9:16 cover: the hook question over the guard's prompt, readable as a thumbnail. */
export function C01Cover(input: HookRenderInput): ReactElement {
  const clock = createClock(input, Math.round(shotStart(input, 'prompt') * input.beatS * input.fps) + 10);
  return (
    <AbsoluteFill style={{ fontFamily: sansFont }}>
      <Backdrop timeline={input} clock={clock} intensity={1.2} />
      <BrandChip top={200} left={70} />
      <div style={{ position: 'absolute', top: 300, left: 70, right: 150, fontSize: 132, fontWeight: 900, lineHeight: 1, letterSpacing: -4 }}>
        <Highlighted text={copyText(input, 'hook')} highlight={copyText(input, 'hookHighlight')} color={hookColors.alarm} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: 930, width: 1080, height: 560 }}>
        <div style={{ position: 'absolute', left: 60, top: 0, transform: 'scale(1.1)', transformOrigin: 'top left' }}>
          <PromptCard command={commands.push} guardVerb="git push" appear={1} press={0} alarm={0.8} left={0} top={0} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function SlideVisual({ slide }: { slide: number }): ReactNode {
  if (slide === 1) {
    return (
      <div style={{ fontFamily: monoFont, fontSize: 30, color: hookColors.text, padding: '28px 30px', borderRadius: 22, backgroundColor: hookColors.window, border: `2px solid ${hookColors.windowEdge}`, whiteSpace: 'nowrap' }}>
        <span style={{ color: hookColors.green }}>{'●'} </span>
        <b>Bash</b>
        <span style={{ color: hookColors.dim }}>(</span>
        {commands.commit}
        <span style={{ color: hookColors.dim }}>)</span>
      </div>
    );
  }
  if (slide === 2) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, width: 900 }}>
        {['git commit', 'git push', 'git merge', 'gh pr create'].map((label, index) => (
          <Pill key={label} label={label} color={motifColors[index] ?? hookColors.accent} beat={SETTLED} atBeat={0} fontSize={44} />
        ))}
      </div>
    );
  }
  if (slide === 3) {
    return <PromptCard command={commands.push} guardVerb="git push" appear={1} press={0} alarm={0.6} left={0} top={0} scale={1.08} />;
  }
  if (slide === 4) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        <Pill label="git commit" color={hookColors.green} beat={SETTLED} atBeat={0} icon="check" fontSize={52} />
        <Pill label="git push" color={hookColors.alarm} beat={SETTLED} atBeat={0} icon="alert" fontSize={52} />
      </div>
    );
  }
  if (slide === 5) {
    return (
      <div style={{ position: 'relative', width: world.rulePanel.w, height: world.rulePanel.h - 160, transform: 'scale(1.0)' }}>
        <div style={{ position: 'absolute', left: -world.rulePanel.x, top: -world.rulePanel.y }}>
          <RulePanel appear={1} highlight={1} fileName="rules/git.md" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', width: 1080, height: 200, marginLeft: -70 }}>
      <LogoMark beat={SETTLED} dotsBeat={0} logoBeat={0} centerY={90} />
    </div>
  );
}

/** Instagram carousel slide (1080x1350); `slide` picks one of six. */
export function C01Carousel(input: HookRenderInput): ReactElement {
  const slide = input.slide;
  const clock = createClock(input, Math.round(input.totalBeats * 0.5 * input.beatS * input.fps));
  const title = copyText(input, `slide${slide}.title`);
  const body = copyText(input, `slide${slide}.body`);
  const isCode = slide === 3;
  return (
    <AbsoluteFill style={{ fontFamily: sansFont }}>
      <Backdrop timeline={input} clock={clock} intensity={0.9} />
      <BrandChip top={70} left={70} />
      <div style={{ position: 'absolute', top: 76, right: 70, fontSize: 30, fontWeight: 700, color: hookColors.muted }}>
        {slide}/6
      </div>
      <div style={{ position: 'absolute', top: 190, left: 70, right: 70, fontSize: slide === 1 ? 96 : 76, fontWeight: 900, lineHeight: 1.04, letterSpacing: -2.5, color: hookColors.text }}>
        {slide === 1 ? <Highlighted text={title} highlight={copyText(input, 'hookHighlight')} color={hookColors.alarm} /> : title}
      </div>
      <div style={{ position: 'absolute', top: slide === 1 ? 520 : 470, left: 70, right: 70, fontSize: 40, fontWeight: 600, color: hookColors.accent, fontFamily: isCode ? monoFont : sansFont }}>{body}</div>
      <div style={{ position: 'absolute', top: 640, left: 70, right: 70, bottom: 90, display: 'flex', alignItems: 'center' }}>
        <SlideVisual slide={slide} />
      </div>
      {slide < 6 ? (
        <div style={{ position: 'absolute', bottom: 50, right: 70, fontSize: 30, fontWeight: 700, color: hookColors.muted }}>{'→'}</div>
      ) : null}
    </AbsoluteFill>
  );
}
