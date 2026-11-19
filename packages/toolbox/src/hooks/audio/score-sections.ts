import type { HookShotTiming, HookTimeline } from '@studio/shared/ace';
import {
  renderAlarm,
  renderClap,
  renderClick,
  renderFmPluck,
  renderHat,
  renderImpact,
  renderKick,
  renderPad,
  renderPing,
  renderSubPulse,
  renderThump,
  renderTick,
} from './instruments';
import { placeMono, placeStereo, type StereoBuffer } from './synth';

/** D major. Motif = Dmaj7 (D F# A C#), one note per git write the guard catches. */
const MOTIF_MIDIS = [74, 78, 81, 85] as const;
const RESOLVE_MIDI = 86;
const SUB_MIDI = 38;
const ARPEGGIO_MIDIS = [62, 66, 69, 73, 74, 73, 69, 66] as const;
const PAD_DMAJ7 = [50, 57, 61, 66] as const;
const PAD_DMAJ9 = [50, 57, 61, 64, 66] as const;
const PAD_WARM = [50, 57, 62, 66, 69] as const;
/** Minor second (D against Eb) over a low D: the tension colour. */
const PAD_TENSION = [50, 62, 63] as const;
const SEGMENT_OVERLAP_S = 0.04;

export interface ScoreBuses {
  pad: StereoBuffer;
  lead: StereoBuffer;
  rhythm: StereoBuffer;
  sfx: StereoBuffer;
}

export interface SectionContext {
  timeline: HookTimeline;
  shot: HookShotTiming;
  next: HookShotTiming | undefined;
  buses: ScoreBuses;
  random: () => number;
  /** Collected for the pad sidechain. */
  kickTimesS: number[];
}

function beatToS(context: SectionContext, beat: number): number {
  return beat * context.timeline.beatS;
}

/** Absolute beat of "<shotId>.<event>", or undefined so other storyboards degrade gracefully. */
function markBeat(context: SectionContext, event: string): number | undefined {
  return context.timeline.marks[`${context.shot.id}.${event}`];
}

/** Marks of this shot whose event name starts with prefix, in time order. */
function marksWithPrefix(context: SectionContext, prefix: string): number[] {
  const shotPrefix = `${context.shot.id}.${prefix}`;
  return Object.entries(context.timeline.marks)
    .filter(([name]) => name.startsWith(shotPrefix))
    .map(([, beat]) => beat)
    .sort((first, second) => first - second);
}

function shotBeats(context: SectionContext, step: number): number[] {
  const beats: number[] = [];
  for (let offset = 0; offset < context.shot.beats - 1e-9; offset += step) beats.push(offset);
  return beats;
}

interface PadSegment {
  midis: readonly number[];
  gain: number;
  cutoffStartHz: number;
  cutoffEndHz: number;
  fadeInS: number;
}

/**
 * The pad ends with the shot. Before the silence or the breath it fades inside the last
 * quarter beat so nothing rings into the cut; elsewhere it overlaps the next segment briefly.
 */
function addPad(context: SectionContext, segment: PadSegment): void {
  const nextSection = context.next?.section;
  const dryCut = nextSection === 'silence' || nextSection === 'resolve';
  const startS = context.shot.startS;
  const durationS = context.shot.endS - startS + (dryCut ? 0 : SEGMENT_OVERLAP_S);
  const pad = renderPad({
    midis: segment.midis,
    durationS,
    cutoffStartHz: segment.cutoffStartHz,
    cutoffEndHz: segment.cutoffEndHz,
    fadeInS: segment.fadeInS,
    fadeOutS: dryCut ? context.timeline.beatS / 4 : SEGMENT_OVERLAP_S,
    random: context.random,
  });
  placeStereo(context.buses.pad, pad, { atS: startS, gain: segment.gain });
}

function addKick(context: SectionContext, beat: number, options: { soft: boolean; gain: number }): void {
  const atS = beatToS(context, beat);
  placeMono(context.buses.rhythm, renderKick(context.random, options.soft), { atS, gain: options.gain });
  context.kickTimesS.push(atS);
}

function addSub(context: SectionContext, beat: number, lengthBeats: number, gain: number): void {
  const voice = renderSubPulse(SUB_MIDI, lengthBeats * context.timeline.beatS);
  placeMono(context.buses.rhythm, voice, { atS: beatToS(context, beat), gain });
}

function addHat(context: SectionContext, beat: number, gain: number): void {
  const pan = (beat * 2) % 2 < 1 ? -0.25 : 0.25;
  placeMono(context.buses.rhythm, renderHat(context.random, 0.025), { atS: beatToS(context, beat), gain, pan });
}

function addClap(context: SectionContext, beat: number, gain: number): void {
  placeMono(context.buses.rhythm, renderClap(context.random), { atS: beatToS(context, beat), gain });
}

function addPing(context: SectionContext, beat: number, midi: number, gain: number): void {
  const voice = renderPing(midi, { decayTauS: 0.35, durationS: 1.4 });
  placeMono(context.buses.lead, voice, { atS: beatToS(context, beat), gain, pan: (midi - 79) / 20 });
}

function sfx(context: SectionContext, voice: Float32Array, atS: number, gain: number): void {
  placeMono(context.buses.sfx, voice, { atS: Math.max(0, atS), gain });
}

interface GrooveOptions {
  kicks: readonly number[];
  claps: readonly number[];
  subs: readonly { at: number; length: number }[];
  softKick: boolean;
  kickGain: number;
  clapGain: number;
  hatGain: number;
}

/** Bar-relative pattern repeated across the shot; bars start at the shot boundary. */
function addGroove(context: SectionContext, groove: GrooveOptions): void {
  const start = context.shot.startBeat;
  for (const offset of shotBeats(context, 0.5)) {
    const inBar = offset % 4;
    if (groove.kicks.includes(inBar)) addKick(context, start + offset, { soft: groove.softKick, gain: groove.kickGain });
    if (groove.claps.includes(inBar)) addClap(context, start + offset, groove.clapGain);
    for (const sub of groove.subs) if (sub.at === inBar) addSub(context, start + offset, sub.length, 0.42);
    if (groove.hatGain > 0) addHat(context, start + offset, inBar % 1 === 0 ? groove.hatGain * 0.6 : groove.hatGain);
  }
}

function renderIntro(context: SectionContext): void {
  addPad(context, { midis: PAD_DMAJ7, gain: 0.26, cutoffStartHz: 600, cutoffEndHz: 1500, fadeInS: context.timeline.beatS });
  marksWithPrefix(context, 'ping').forEach((beat, index) => {
    addPing(context, beat, MOTIF_MIDIS[index % MOTIF_MIDIS.length] ?? MOTIF_MIDIS[0], 0.32);
  });
  const typeStart = markBeat(context, 'typeStart');
  const typeEnd = markBeat(context, 'typeEnd');
  if (typeStart === undefined || typeEnd === undefined) return;
  // The keystrokes tick on 8ths so the hat that enters later is already familiar.
  for (let beat = typeStart; beat < typeEnd - 1e-9; beat += 0.5) {
    placeMono(context.buses.rhythm, renderTick(context.random), { atS: beatToS(context, beat), gain: 0.16, pan: 0.15 });
  }
}

function renderDrop(context: SectionContext): void {
  sfx(context, renderImpact(context.random), context.shot.startS, 0.75);
  const card = markBeat(context, 'card');
  if (card !== undefined) sfx(context, renderAlarm(), beatToS(context, card) - 0.06, 0.16);
  addPad(context, { midis: PAD_DMAJ7, gain: 0.6, cutoffStartHz: 2600, cutoffEndHz: 2200, fadeInS: 0.008 });
  addGroove(context, {
    kicks: [0, 2], claps: [], subs: [{ at: 0, length: 1.5 }, { at: 2, length: 1.5 }],
    softKick: false, kickGain: 1, clapGain: 0, hatGain: 0,
  });
}

function renderGrooveSection(context: SectionContext): void {
  addPad(context, { midis: PAD_DMAJ7, gain: 0.42, cutoffStartHz: 1800, cutoffEndHz: 2200, fadeInS: SEGMENT_OVERLAP_S });
  addGroove(context, {
    kicks: [0], claps: [2], subs: [{ at: 0, length: 1.2 }, { at: 2.5, length: 0.5 }],
    softKick: false, kickGain: 0.8, clapGain: 0.22, hatGain: 0.12,
  });
  marksWithPrefix(context, 'pill').forEach((beat, index) => {
    addPing(context, beat, MOTIF_MIDIS[index % MOTIF_MIDIS.length] ?? MOTIF_MIDIS[0], 0.26 + index * 0.02);
  });
}

function renderFull(context: SectionContext): void {
  addPad(context, { midis: PAD_DMAJ9, gain: 0.42, cutoffStartHz: 2800, cutoffEndHz: 3400, fadeInS: SEGMENT_OVERLAP_S });
  addGroove(context, {
    kicks: [0, 2], claps: [1, 3], subs: [0, 1, 2, 3].map((at) => ({ at, length: 0.7 })),
    softKick: false, kickGain: 0.95, clapGain: 0.26, hatGain: 0.16,
  });
  shotBeats(context, 0.25).forEach((offset, index) => {
    const midi = ARPEGGIO_MIDIS[index % ARPEGGIO_MIDIS.length] ?? ARPEGGIO_MIDIS[0];
    const voice = renderFmPluck(midi, 0.45);
    const atS = beatToS(context, context.shot.startBeat + offset);
    placeMono(context.buses.lead, voice, { atS, gain: index % 4 === 0 ? 0.17 : 0.12, pan: index % 2 === 0 ? -0.3 : 0.3 });
  });
  const click = markBeat(context, 'click');
  if (click !== undefined) sfx(context, renderClick(context.random), beatToS(context, click), 0.22);
  const done = markBeat(context, 'commitDone');
  if (done !== undefined) {
    const doneS = beatToS(context, done);
    sfx(context, renderPing(81, { decayTauS: 0.25, durationS: 0.9 }), doneS, 0.12);
    sfx(context, renderPing(86, { decayTauS: 0.3, durationS: 1 }), doneS + 0.07, 0.1);
  }
}

function renderTension(context: SectionContext): void {
  addPad(context, { midis: PAD_TENSION, gain: 0.3, cutoffStartHz: 1400, cutoffEndHz: 900, fadeInS: SEGMENT_OVERLAP_S });
  for (const offset of shotBeats(context, 1)) addSub(context, context.shot.startBeat + offset, 0.6, 0.28);
  const alarm = markBeat(context, 'alarm');
  if (alarm !== undefined) sfx(context, renderAlarm(), beatToS(context, alarm), 0.16);
  const card = markBeat(context, 'card');
  if (card !== undefined) sfx(context, renderThump(), beatToS(context, card), 0.45);
}

function renderWarm(context: SectionContext): void {
  addPad(context, { midis: PAD_WARM, gain: 0.4, cutoffStartHz: 700, cutoffEndHz: 3800, fadeInS: SEGMENT_OVERLAP_S });
  addGroove(context, {
    kicks: [0, 1.5], claps: [2], subs: [{ at: 0, length: 1.2 }, { at: 1.5, length: 1 }],
    softKick: true, kickGain: 0.75, clapGain: 0.14, hatGain: 0.08,
  });
}

/** Breath (one beat of near-silence), the motif rising, then high D held to the end. */
function renderResolve(context: SectionContext): void {
  const breath = markBeat(context, 'breath') ?? context.shot.startBeat;
  const logo = markBeat(context, 'logo') ?? breath + 2;
  const riseStart = Math.min(breath + 1, logo - 1);
  const step = (logo - riseStart) / MOTIF_MIDIS.length;
  MOTIF_MIDIS.forEach((midi, index) => addPing(context, riseStart + index * step, midi, 0.2 + index * 0.03));
  const logoS = beatToS(context, logo);
  const tailS = Math.max(0.5, context.timeline.durationS - logoS);
  placeMono(context.buses.lead, renderPing(RESOLVE_MIDI, { decayTauS: 1.6, durationS: tailS }), { atS: logoS, gain: 0.3 });
  const pad = renderPad({
    midis: [...PAD_DMAJ9, 69], durationS: tailS, cutoffStartHz: 2600, cutoffEndHz: 900,
    fadeInS: 0.05, fadeOutS: tailS * 0.8, random: context.random,
  });
  placeStereo(context.buses.pad, pad, { atS: logoS, gain: 0.3 });
  addSub(context, logo, Math.min(3, tailS / context.timeline.beatS), 0.35);
}

/** Silence renders nothing: the score mask and room tone own it. */
export function renderSection(context: SectionContext): void {
  switch (context.shot.section) {
    case 'intro': return renderIntro(context);
    case 'silence': return;
    case 'drop': return renderDrop(context);
    case 'groove': return renderGrooveSection(context);
    case 'full': return renderFull(context);
    case 'tension': return renderTension(context);
    case 'warm': return renderWarm(context);
    case 'resolve': return renderResolve(context);
  }
}
