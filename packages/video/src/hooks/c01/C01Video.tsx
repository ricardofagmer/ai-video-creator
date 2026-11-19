import type { ReactElement } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame } from 'remotion';
import type { HookRenderInput } from '@studio/shared/ace';
import { breathe, cameraSpeed, poseAt, shakeOffset, toScreen, worldTransform, type CameraPose } from '../camera';
import { copyText, createClock, easeOut, type HookClock } from '../clock';
import { hookColors, motifColors, sansFont } from '../hook-theme';
import { Backdrop } from '../overlays/Backdrop';
import { Cursor } from '../overlays/Cursor';
import { HookTitle } from '../overlays/HookTitle';
import { KineticCaption } from '../overlays/KineticCaption';
import { LogoMark } from '../overlays/LogoMark';
import { Pill } from '../overlays/Pill';
import { Spot, type ScreenRect } from '../overlays/Spot';
import { cameraKeys, readBeats, terminalState, type C01Beats } from './direction';
import { RulePanel, ruleFocusY } from './RulePanel';
import { Terminal } from './Terminal';
import { world } from './world';

const PILL_LABELS = ['git commit', 'git push', 'git merge', 'gh pr create'] as const;

function cameraAt(input: HookRenderInput, frame: number): { pose: CameraPose; speed: number } {
  const clockNow = createClock(input, frame);
  const clockBefore = createClock(input, Math.max(0, frame - 1));
  const keys = cameraKeys(readBeats(input, clockNow));
  const pose = breathe(poseAt(keys, clockNow.beat), frame / input.fps);
  const before = breathe(poseAt(keys, clockBefore.beat), (frame - 1) / input.fps);
  return { pose, speed: cameraSpeed(before, pose) };
}

function worldRect(pose: CameraPose, rect: { x: number; y: number; w: number; h: number }, pad = 14): ScreenRect {
  const topLeft = toScreen(pose, rect.x - pad, rect.y - pad);
  return { x: topLeft.x, y: topLeft.y, w: (rect.w + pad * 2) * pose.zoom, h: (rect.h + pad * 2) * pose.zoom };
}

function spotFor(clock: HookClock, beats: C01Beats, pose: CameraPose): { rect: ScreenRect; amount: number } | null {
  const commitCard = { x: world.pad, y: world.rows.commitCard, w: world.card.w, h: world.card.h };
  const pushCard = { x: world.pad, y: world.rows.pushCard, w: world.card.w, h: world.card.h };
  const ruleRect = { x: 0, y: ruleFocusY - 50, w: world.rulePanel.w, h: 100 };
  if (clock.beat >= beats.card && clock.beat < beats.writes) return { rect: worldRect(pose, commitCard), amount: clock.progress(beats.card, 0.5) * (1 - clock.progress(beats.writes - 0.5, 0.5)) };
  if (clock.beat >= beats.againCard && clock.beat < beats.rule) return { rect: worldRect(pose, pushCard), amount: clock.progress(beats.againCard, 0.5) * (1 - clock.progress(beats.rule - 0.5, 0.5)) };
  if (clock.beat >= beats.highlightRule && clock.beat < beats.cta) return { rect: worldRect(pose, ruleRect, 0), amount: clock.progress(beats.highlightRule, 1) * (1 - clock.progress(beats.cta - 0.5, 0.5)) };
  return null;
}

/** C01 "Sua IA faz commit sem pedir?": a one-take inside a recreated Claude Code session. */
export function C01Video(input: HookRenderInput): ReactElement {
  const frame = useCurrentFrame();
  const clock = createClock(input, frame);
  const beats = readBeats(input, clock);
  const { pose, speed } = cameraAt(input, frame);
  const shake = shakeOffset(clock.beat, [beats.card, beats.againCard]);
  const blur = Math.min(7, Math.max(0, speed - 12) / 14);
  const worldFade = 1 - clock.progress(beats.cta, 1.2);
  const flash = Math.max(...[beats.card, beats.againCard].map((at) => interpolate(clock.beat, [at, at + 0.35], [0.35, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * (clock.beat >= at ? 1 : 0)));
  const spot = spotFor(clock, beats, pose);
  const pillsOut = clock.progress(beats.approve, 0.75);
  const yes = toScreen(pose, world.pad + world.yesOption.x + 70, world.rows.commitCard + world.yesOption.y + 26);
  const timeS = frame / input.fps;

  return (
    <AbsoluteFill style={{ fontFamily: sansFont }}>
      <Backdrop timeline={input} clock={clock} />
      <AbsoluteFill style={{ transform: `translate(${shake.x}px, ${shake.y}px)`, opacity: worldFade, filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: worldTransform(pose) }}>
          <Terminal state={terminalState(input, clock, beats)} />
          <RulePanel appear={clock.progress(beats.rule + 0.5, 1.5, easeOut)} highlight={clock.progress(beats.highlightRule, 1)} fileName={copyText(input, 'ruleCaption') || 'rules/git.md'} />
          <div style={{ position: 'absolute', left: world.pad, top: world.pills.y, width: world.card.w, display: 'flex', flexWrap: 'wrap', gap: '28px 24px', opacity: 1 - pillsOut }}>
            {PILL_LABELS.map((label, index) => (
              <Pill key={label} label={label} color={motifColors[index] ?? hookColors.accent} beat={clock.beat} atBeat={beats.pills[index] ?? beats.writes} />
            ))}
          </div>
        </div>
      </AbsoluteFill>
      {spot ? <Spot rect={spot.rect} amount={spot.amount * worldFade} /> : null}
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF', opacity: flash, mixBlendMode: 'overlay' }} />
      <Scrims worldFade={worldFade} titleHold={1 - clock.progress(beats.freeze, 0.5)} />
      <HookTitle text={copyText(input, 'hook')} highlight={copyText(input, 'hookHighlight')} beat={clock.beat} startBeat={0} endBeat={beats.freeze} />
      <StatusLabels clock={clock} beats={beats} input={input} />
      <Cursor beat={clock.beat} from={{ x: 980, y: 1500 }} to={yes} moveStartBeat={beats.cursorMove} clickBeat={beats.click} hideBeat={beats.commitDone + 0.5} />
      <KineticCaption lines={input.lines} timeS={timeS} />
      <Closing clock={clock} beats={beats} input={input} />
      {input.audioUrl ? <Audio src={input.audioUrl} /> : null}
    </AbsoluteFill>
  );
}

/** Top and bottom shades so the title, labels and captions never sit on raw terminal text. */
function Scrims({ worldFade, titleHold }: { worldFade: number; titleHold: number }): ReactElement {
  const shade = 'rgba(7, 12, 24, 0.94)';
  // While the hook title is up, the shade stays solid down to just above the user prompt row.
  const solidStop = Math.round(55 + 30 * titleHold);
  return (
    <AbsoluteFill style={{ opacity: worldFade, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 560, background: `linear-gradient(${shade} 0%, ${shade} ${solidStop}%, rgba(7, 12, 24, 0) 100%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 760, background: `linear-gradient(rgba(7, 12, 24, 0) 0%, ${shade} 40%, ${shade} 100%)` }} />
    </AbsoluteFill>
  );
}

/** Brand chip (early, before 15 s) and the approved / asks-again labels in the top band. */
function StatusLabels({ clock, beats, input }: { clock: HookClock; beats: C01Beats; input: HookRenderInput }): ReactElement {
  const chip = clock.progress(beats.card, 0.5) * (1 - clock.progress(beats.cta, 0.5));
  const showApproved = clock.beat >= beats.commitDone && clock.beat < beats.againCard;
  const showAsked = clock.beat >= beats.againCard && clock.beat < beats.rule;
  return (
    <>
      <div style={{ position: 'absolute', left: 70, top: 196, display: 'flex', alignItems: 'center', gap: 12, opacity: chip, fontSize: 30, fontWeight: 800, color: hookColors.text }}>
        <div style={{ display: 'grid', gridTemplateColumns: '12px 12px', gap: 4 }}>
          {motifColors.map((color) => (
            <div key={color} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
          ))}
        </div>
        Engine<span style={{ color: hookColors.accent, marginLeft: -12 }}>OS</span>
      </div>
      <div style={{ position: 'absolute', left: 70, top: 280 }}>
        {showApproved ? <Pill label={copyText(input, 'approvedLabel')} color={hookColors.green} beat={clock.beat} atBeat={beats.commitDone} icon="check" fontSize={40} /> : null}
        {showAsked ? <Pill label={copyText(input, 'askedLabel')} color={hookColors.alarm} beat={clock.beat} atBeat={beats.againCard} icon="alert" fontSize={40} /> : null}
      </div>
    </>
  );
}

function Closing({ clock, beats, input }: { clock: HookClock; beats: C01Beats; input: HookRenderInput }): ReactElement | null {
  if (clock.beat < beats.cta) return null;
  const cta = clock.progress(beats.ctaText, 0.6, easeOut);
  return (
    <AbsoluteFill>
      <LogoMark beat={clock.beat} dotsBeat={beats.dots} logoBeat={beats.logo} centerY={720} />
      <div style={{ position: 'absolute', left: 70, right: 150, top: 900, textAlign: 'center', opacity: cta, transform: `translateY(${(1 - cta) * 30}px)` }}>
        <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: -2, color: hookColors.text }}>{copyText(input, 'cta')}</div>
        <div style={{ fontSize: 46, fontWeight: 600, color: hookColors.accent, marginTop: 10 }}>{copyText(input, 'ctaSub')}</div>
      </div>
      <div style={{ position: 'absolute', left: 70, right: 150, top: 200, textAlign: 'center', fontSize: 26, color: hookColors.muted, opacity: cta * 0.9 }}>{copyText(input, 'disclosure')}</div>
    </AbsoluteFill>
  );
}
