import { useMemo, type ReactElement, type ReactNode } from 'react';
import { AbsoluteFill, Audio, useCurrentFrame } from 'remotion';
import type { HookRenderInput } from '@studio/shared/ace';
import { copyText, createClock, easeOut, shotStart, type HookClock } from '../clock';
import { hookColors, motifColors, sansFont } from '../hook-theme';
import { commands } from '../c01/world';
import { PromptCard } from '../c01/PromptCard';
import { Backdrop } from '../overlays/Backdrop';
import { HookTitle } from '../overlays/HookTitle';
import { KineticCaption } from '../overlays/KineticCaption';
import { LogoMark } from '../overlays/LogoMark';
import { Pill } from '../overlays/Pill';
import { Avatar, AVATAR_VIEWBOX } from './Avatar';
import { avatarPoseAt } from './avatar-motion';
import { RouterCard, RulesCard, SecretCard, proofCardWidth } from './ProofCards';

const CARD_LEFT = 70;
const CARD_TOP = 360;
const PROMPT_CARD_WIDTH = 828;

interface Placement {
  left: number;
  top: number;
  width: number;
}

/** Where the avatar stands: big in the hook, lower-left beside the proofs, centred for the CTA. */
const placements = {
  hook: { left: 160, top: 800, width: 760 },
  proofs: { left: 10, top: 870, width: 600 },
  cta: { left: 290, top: 1040, width: 500 },
} as const satisfies Record<string, Placement>;

function mix(from: Placement, to: Placement, amount: number): Placement {
  return {
    left: from.left + (to.left - from.left) * amount,
    top: from.top + (to.top - from.top) * amount,
    width: from.width + (to.width - from.width) * amount,
  };
}

interface IntroBeats {
  who: number;
  git: number;
  secret: number;
  agents: number;
  cta: number;
  avatarIn: number;
  pillRules: number;
  pillGit: number;
  alarm: number;
  pillRouter: number;
  pillAgents: number;
  dots: number;
  logo: number;
  ctaText: number;
}

function readBeats(input: HookRenderInput, clock: HookClock): IntroBeats {
  const who = shotStart(input, 'who');
  const git = shotStart(input, 'git');
  const secret = shotStart(input, 'secret');
  const agents = shotStart(input, 'agents');
  const cta = shotStart(input, 'cta');
  return {
    who,
    git,
    secret,
    agents,
    cta,
    avatarIn: clock.mark('hook.avatarIn', 0.25),
    pillRules: clock.mark('who.pillRules', who + 2),
    pillGit: clock.mark('git.pillGit', git + 1),
    alarm: clock.mark('secret.alarm', secret + 1.5),
    pillRouter: clock.mark('agents.pillRouter', agents + 1),
    pillAgents: clock.mark('agents.pillAgents', agents + 2.5),
    dots: clock.mark('cta.dots', cta + 0.5),
    logo: clock.mark('cta.logo', cta + 2),
    ctaText: clock.mark('cta.cta', cta + 3),
  };
}

/** Fades a shot's card in at its start and out just before the next shot. */
function CardSlot({ clock, from, to, children }: { clock: HookClock; from: number; to: number; children: ReactNode }): ReactElement | null {
  if (clock.beat < from - 0.1 || clock.beat >= to) return null;
  const enter = clock.progress(from, 0.6, easeOut);
  const exit = 1 - clock.progress(to - 0.35, 0.35);
  return (
    <div style={{ position: 'absolute', left: CARD_LEFT, top: CARD_TOP, opacity: enter * exit, transform: `translateY(${(1 - enter) * 50}px) scale(${0.94 + enter * 0.06})`, transformOrigin: '50% 0%' }}>
      {children}
    </div>
  );
}

function ProofCard({ clock, beats }: { clock: HookClock; beats: IntroBeats }): ReactElement {
  const shake = clock.beat >= beats.alarm && clock.beat < beats.alarm + 0.6 ? Math.sin(clock.frame * 2.4) * 10 * (1 - clock.progress(beats.alarm, 0.6)) : 0;
  return (
    <>
      <CardSlot clock={clock} from={beats.who} to={beats.git}>
        <RulesCard reveal={clock.progress(beats.pillRules - 0.5, 2, easeOut) * 5} />
      </CardSlot>
      <CardSlot clock={clock} from={beats.git} to={beats.secret}>
        <div style={{ position: 'relative', width: proofCardWidth, height: 340 }}>
          <PromptCard command={commands.commit} guardVerb="git commit" appear={clock.progress(beats.pillGit - 0.5, 0.6, easeOut)} press={0} alarm={clock.progress(beats.pillGit, 0.5)} left={0} top={0} scale={proofCardWidth / PROMPT_CARD_WIDTH} />
        </div>
      </CardSlot>
      <CardSlot clock={clock} from={beats.secret} to={beats.agents}>
        <div style={{ transform: `translateX(${shake}px)` }}>
          <SecretCard reveal={clock.progress(beats.secret + 0.2, 0.5) + clock.progress(beats.alarm, 0.5, easeOut)} alarm={clock.progress(beats.alarm, 0.3)} />
        </div>
      </CardSlot>
      <CardSlot clock={clock} from={beats.agents} to={beats.cta}>
        <RouterCard reveal={clock.progress(beats.pillRouter - 0.25, 1.5, easeOut) * 3} dots={clock.progress(beats.pillAgents, 1.2, easeOut)} />
      </CardSlot>
    </>
  );
}

/** Name tag in the "who" shot, then one status pill per proof, beside his head. */
function SideLabels({ input, clock, beats }: { input: HookRenderInput; clock: HookClock; beats: IntroBeats }): ReactElement | null {
  if (clock.beat < beats.who || clock.beat >= beats.cta) return null;
  const tag = clock.progress(beats.who + 0.25, 0.8, easeOut) * (1 - clock.progress(beats.git - 0.3, 0.3));
  return (
    <div style={{ position: 'absolute', left: 600, top: 1000, width: 440 }}>
      {clock.beat < beats.git ? (
        <div style={{ opacity: tag, transform: `translateX(${(1 - tag) * 40}px)` }}>
          <div style={{ fontSize: 50, fontWeight: 900, color: hookColors.text, letterSpacing: -1 }}>{copyText(input, 'name')}</div>
          <div style={{ fontSize: 32, fontWeight: 600, color: hookColors.accent, marginTop: 6 }}>{copyText(input, 'role')}</div>
          <div style={{ fontSize: 28, color: hookColors.muted, marginTop: 8 }}>{copyText(input, 'handle')}</div>
        </div>
      ) : null}
      {clock.beat >= beats.git && clock.beat < beats.secret ? <Pill label={copyText(input, 'gitLabel')} color={hookColors.amber} beat={clock.beat} atBeat={beats.pillGit} icon="lock" fontSize={36} /> : null}
      {clock.beat >= beats.secret && clock.beat < beats.agents ? <Pill label={copyText(input, 'secretLabel')} color={hookColors.alarm} beat={clock.beat} atBeat={beats.alarm} icon="alert" fontSize={36} /> : null}
      {clock.beat >= beats.agents ? <Pill label={copyText(input, 'agentsLabel')} color={hookColors.accent} beat={clock.beat} atBeat={beats.pillAgents} icon="check" fontSize={36} /> : null}
    </div>
  );
}

function BrandChip({ opacity }: { opacity: number }): ReactElement {
  return (
    <div style={{ position: 'absolute', left: 70, top: 200, display: 'flex', alignItems: 'center', gap: 12, opacity, fontSize: 30, fontWeight: 800, color: hookColors.text }}>
      <div style={{ display: 'grid', gridTemplateColumns: '12px 12px', gap: 4 }}>
        {motifColors.map((color) => (
          <div key={color} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
        ))}
      </div>
      Engine<span style={{ color: hookColors.accent, marginLeft: -12 }}>OS</span>
    </div>
  );
}

function Closing({ input, clock, beats }: { input: HookRenderInput; clock: HookClock; beats: IntroBeats }): ReactElement | null {
  if (clock.beat < beats.cta) return null;
  const cta = clock.progress(beats.ctaText, 0.6, easeOut);
  return (
    <AbsoluteFill>
      <LogoMark beat={clock.beat} dotsBeat={beats.dots} logoBeat={beats.logo} centerY={500} />
      <div style={{ position: 'absolute', left: 70, right: 150, top: 640, textAlign: 'center', opacity: cta, transform: `translateY(${(1 - cta) * 30}px)` }}>
        <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: -2, color: hookColors.text }}>{copyText(input, 'cta')}</div>
        <div style={{ fontSize: 46, fontWeight: 600, color: hookColors.accent, marginTop: 10 }}>{copyText(input, 'ctaSub')}</div>
      </div>
      <div style={{ position: 'absolute', left: 70, right: 150, top: 200, textAlign: 'center', fontSize: 26, color: hookColors.muted, opacity: cta * 0.9 }}>{copyText(input, 'disclosure')}</div>
    </AbsoluteFill>
  );
}

/** Intro: the illustrated Ricardo presents EngineOS, three proofs beside him, then the CTA. */
export function IntroVideo(input: HookRenderInput): ReactElement {
  const frame = useCurrentFrame();
  const clock = createClock(input, frame);
  const beats = readBeats(input, clock);
  const timeS = frame / input.fps;

  const toProofs = clock.progress(beats.who, 1.2);
  const toCta = clock.progress(beats.cta, 1.2);
  const place = mix(mix(placements.hook, placements.proofs, toProofs), placements.cta, toCta);
  const enter = clock.progress(beats.avatarIn, 1.4, easeOut);
  const lookUp = toProofs * (1 - toCta);
  const pose = avatarPoseAt({ lines: input.lines, frame, fps: input.fps, look: { x: 3 * lookUp, y: -3.5 * lookUp } });
  const captionLines = useMemo(() => input.lines.filter((line) => line.shotId !== 'cta'), [input.lines]);
  const avatarHeight = (place.width * AVATAR_VIEWBOX.h) / AVATAR_VIEWBOX.w;

  return (
    <AbsoluteFill style={{ fontFamily: sansFont }}>
      <Backdrop timeline={input} clock={clock} />
      <div style={{ position: 'absolute', left: place.left, top: place.top + (1 - enter) * 360, width: place.width, height: avatarHeight, opacity: enter, filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.5))' }}>
        <Avatar pose={pose} width={place.width} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 520, background: 'linear-gradient(rgba(7,12,24,0) 0%, rgba(7,12,24,0.9) 55%, rgba(7,12,24,0.95) 100%)' }} />
      <HookTitle text={copyText(input, 'hook')} highlight={copyText(input, 'hookHighlight')} beat={clock.beat} startBeat={0} endBeat={beats.who} />
      <BrandChip opacity={clock.progress(beats.who, 0.5) * (1 - clock.progress(beats.cta, 0.5))} />
      <ProofCard clock={clock} beats={beats} />
      <SideLabels input={input} clock={clock} beats={beats} />
      <KineticCaption lines={captionLines} timeS={timeS} />
      <Closing input={input} clock={clock} beats={beats} />
      {input.audioUrl ? <Audio src={input.audioUrl} /> : null}
    </AbsoluteFill>
  );
}
