import type { HookTimeline } from '@studio/shared/ace';
import type { CameraKey } from '../camera';
import { easeOut, shotStart, whip, type HookClock } from '../clock';
import { ruleFocusY } from './RulePanel';
import type { TerminalState } from './Terminal';
import { world } from './world';

/** Named beats of C01, read once from the timeline marks (with safe fallbacks). */
export interface C01Beats {
  typeStart: number;
  typeEnd: number;
  freeze: number;
  card: number;
  writes: number;
  pills: [number, number, number, number];
  approve: number;
  cursorMove: number;
  click: number;
  commitDone: number;
  again: number;
  pushTyped: number;
  againCard: number;
  rule: number;
  highlightRule: number;
  cta: number;
  dots: number;
  logo: number;
  ctaText: number;
  end: number;
}

export function readBeats(timeline: HookTimeline, clock: HookClock): C01Beats {
  const writes = shotStart(timeline, 'writes');
  const approve = shotStart(timeline, 'approve');
  const again = shotStart(timeline, 'again');
  const rule = shotStart(timeline, 'rule');
  const cta = shotStart(timeline, 'cta');
  return {
    typeStart: clock.mark('hook.typeStart', 1),
    typeEnd: clock.mark('hook.typeEnd', 4.5),
    freeze: shotStart(timeline, 'freeze'),
    card: clock.mark('prompt.card', shotStart(timeline, 'prompt')),
    writes,
    pills: [
      clock.mark('writes.pillCommit', writes + 2),
      clock.mark('writes.pillPush', writes + 3),
      clock.mark('writes.pillMerge', writes + 4),
      clock.mark('writes.pillPr', writes + 5),
    ],
    approve,
    cursorMove: clock.mark('approve.cursorMove', approve),
    click: clock.mark('approve.click', approve + 2),
    commitDone: clock.mark('approve.commitDone', approve + 2.5),
    again,
    pushTyped: clock.mark('again.pushTyped', again),
    againCard: clock.mark('again.card', again + 2),
    rule,
    highlightRule: clock.mark('rule.highlightRule', rule + 2),
    cta,
    dots: clock.mark('cta.dots', cta + 0.5),
    logo: clock.mark('cta.logo', cta + 2),
    ctaText: clock.mark('cta.cta', cta + 3),
    end: timeline.totalBeats,
  };
}

const cardCenterY = world.rows.commitCard + world.card.h / 2;
const pushCardCenterY = world.rows.pushCard + world.card.h / 2;
const yesY = world.rows.commitCard + world.yesOption.y + world.yesOption.h / 2;

/** The one-take camera path: every move is motivated by a story beat. */
export function cameraKeys(beats: C01Beats): CameraKey[] {
  return [
    { atBeat: 0, moveBeats: 0, cx: 330, cy: world.rows.commitCall + 23, zoom: 2.1 },
    { atBeat: beats.typeStart, moveBeats: beats.typeEnd - beats.typeStart, cx: 520, cy: world.rows.commitCall + 23, zoom: 2.3 },
    { atBeat: beats.freeze, moveBeats: beats.card - beats.freeze, cx: 540, cy: world.rows.commitCall + 23, zoom: 2.55, easing: easeOut },
    { atBeat: beats.card - 0.15, moveBeats: 0.5, cx: 450, cy: cardCenterY, zoom: 1.18, easing: whip },
    { atBeat: beats.writes, moveBeats: 2, cx: 450, cy: 740, zoom: 1.0 },
    { atBeat: beats.cursorMove, moveBeats: 1.2, cx: 380, cy: yesY - 40, zoom: 1.5 },
    { atBeat: beats.commitDone, moveBeats: 1, cx: 450, cy: world.rows.commitCard + 40, zoom: 1.32 },
    { atBeat: beats.pushTyped, moveBeats: 1, cx: 480, cy: world.rows.pushCall + 23, zoom: 1.55 },
    { atBeat: beats.againCard - 0.15, moveBeats: 0.5, cx: 450, cy: pushCardCenterY, zoom: 1.16, easing: whip },
    { atBeat: beats.rule, moveBeats: 2.5, cx: 450, cy: 980, zoom: 0.6 },
    { atBeat: beats.highlightRule, moveBeats: 1.5, cx: 450, cy: ruleFocusY, zoom: 1.08 },
    { atBeat: beats.cta, moveBeats: 3, cx: 450, cy: 1100, zoom: 0.45 },
  ];
}

export function terminalState(timeline: HookTimeline, clock: HookClock, beats: C01Beats): TerminalState {
  const desaturateIn = clock.progress(beats.freeze, 0.25);
  const desaturateOut = clock.progress(beats.writes, 1);
  const tension = clock.progress(beats.againCard, 0.5) * (1 - clock.progress(beats.rule, 1));
  return {
    userPrompt: timeline.copy.userPrompt ?? '',
    claudeSay: timeline.copy.claudeSay ?? '',
    commitTyped: clock.progress(beats.typeStart, beats.typeEnd - beats.typeStart, (input) => input),
    commitCard: {
      appear: clock.progress(beats.card, 0.35, easeOut),
      press: clock.beat >= beats.click && clock.beat < beats.click + 0.4 ? 1 : 0,
      alarm: clock.progress(beats.card, 0.1) * (1 - clock.progress(beats.card + 0.3, 1.5)),
    },
    commitApproved: clock.progress(beats.commitDone, 0.4, easeOut),
    pushTyped: clock.progress(beats.pushTyped, Math.max(0.5, beats.againCard - beats.pushTyped - 0.5), (input) => input),
    pushCard: {
      appear: clock.progress(beats.againCard, 0.35, easeOut),
      alarm: clock.progress(beats.againCard, 0.1) * (1 - clock.progress(beats.againCard + 0.3, 1.5)),
    },
    desaturate: Math.max(desaturateIn * (1 - desaturateOut), tension * 0.6),
    caretOn: clock.beat < beats.freeze && Math.floor(clock.beat * 2) % 2 === 0,
  };
}
