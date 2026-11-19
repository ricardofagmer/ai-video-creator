import type { HookShotTiming, HookTimeline } from '@studio/shared/ace';
import { applyGain, automatedLowpass, peakOf, reverb, softClipBuffer, sumInto } from './effects';
import { renderRoomTone } from './instruments';
import { renderSection, type ScoreBuses } from './score-sections';
import { createRandom, createStereo, dbToGain, placeMono, type StereoBuffer } from './synth';

export interface ComposedScore {
  music: StereoBuffer;
  sfx: StereoBuffer;
}

const OPEN_CUTOFF_HZ = 18_000;
const TENSION_CUTOFF_HZ = 700;
const DRY_CUT_RAMP_S = 0.004;
const DUCK_DEPTH = 0.55;
const DUCK_RECOVERY_S = 0.11;
const ROOM_TONE_DB = -60;
const END_FADE_S = 1.5;
const BREATH_FLOOR = 0.12;
const BREATH_RAMP_S = 0.06;
const OUTPUT_PEAK = 0.89;

function seedOf(timeline: HookTimeline): number {
  let hash = 2166136261;
  for (const character of `${timeline.videoId}:${timeline.lang}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function shotAt(shots: readonly HookShotTiming[], t: number): HookShotTiming | undefined {
  return shots.find((shot) => t >= shot.startS && t < shot.endS);
}

/** Closes during tension (first beat glides down), opens across the warm shot. */
function musicCutoffAt(timeline: HookTimeline): (t: number) => number {
  return (t) => {
    const shot = shotAt(timeline.shots, t);
    if (!shot) return OPEN_CUTOFF_HZ;
    const progress = (t - shot.startS) / Math.max(shot.endS - shot.startS, 1e-6);
    if (shot.section === 'tension') {
      const glide = Math.min(1, (t - shot.startS) / timeline.beatS);
      return 4000 * (TENSION_CUTOFF_HZ / 4000) ** glide;
    }
    if (shot.section === 'warm') return 900 * (OPEN_CUTOFF_HZ / 900) ** progress;
    return OPEN_CUTOFF_HZ;
  };
}

/** Each kick pulls the pad down and lets it breathe back: the sidechain pump. */
function duckPadOnKicks(pad: StereoBuffer, kickTimesS: readonly number[]): void {
  const kicks = [...kickTimesS].sort((first, second) => first - second);
  let nextKick = 0;
  let lastKickS = Number.NEGATIVE_INFINITY;
  applyGain(pad, (t) => {
    while (nextKick < kicks.length && (kicks[nextKick] ?? Number.POSITIVE_INFINITY) <= t) {
      lastKickS = kicks[nextKick] ?? lastKickS;
      nextKick += 1;
    }
    const since = t - lastKickS;
    if (!Number.isFinite(since)) return 1;
    const attack = Math.min(1, since / 0.005);
    return 1 - DUCK_DEPTH * attack * Math.exp(-since / DUCK_RECOVERY_S);
  });
}

/** Music is cut dry at each silence shot and comes back exactly on the next shot. */
function silenceMask(timeline: HookTimeline): (t: number) => number {
  const silences = timeline.shots.filter((shot) => shot.section === 'silence');
  return (t) => {
    for (const shot of silences) {
      if (t >= shot.startS && t < shot.endS) {
        const out = Math.max(0, 1 - (t - shot.startS) / DRY_CUT_RAMP_S);
        const back = Math.max(0, 1 - (shot.endS - t) / DRY_CUT_RAMP_S);
        return Math.max(out, back);
      }
    }
    return 1;
  };
}

/** The breath before the resolve pulls the reverb tail down to near-silence for one beat. */
function breathMask(timeline: HookTimeline): (t: number) => number {
  const breaths = timeline.shots
    .filter((shot) => shot.section === 'resolve')
    .map((shot) => (timeline.marks[`${shot.id}.breath`] ?? shot.startBeat) * timeline.beatS);
  return (t) => {
    for (const startS of breaths) {
      const endS = startS + timeline.beatS;
      if (t >= startS && t < endS) {
        const into = Math.min(1, (t - startS) / BREATH_RAMP_S);
        const outOf = Math.min(1, (endS - t) / BREATH_RAMP_S);
        return 1 - (1 - BREATH_FLOOR) * Math.min(into, outOf);
      }
    }
    return 1;
  };
}

function endFade(durationS: number): (t: number) => number {
  return (t) => {
    const remaining = durationS - t;
    if (remaining >= END_FADE_S) return 1;
    return Math.max(0, remaining / END_FADE_S) ** 2;
  };
}

function rms(voice: Float32Array): number {
  let sum = 0;
  for (const sample of voice) sum += sample * sample;
  return Math.sqrt(sum / Math.max(voice.length, 1));
}

function addRoomTone(music: StereoBuffer, timeline: HookTimeline, random: () => number): void {
  for (const shot of timeline.shots.filter((candidate) => candidate.section === 'silence')) {
    const tone = renderRoomTone(random, shot.endS - shot.startS);
    const gain = dbToGain(ROOM_TONE_DB) / Math.max(rms(tone), 1e-9);
    placeMono(music, tone, { atS: shot.startS, gain });
  }
}

/**
 * Composes the beat-locked score for a hook timeline: music (pad, groove, motif) and sfx
 * (impact, alarms, UI) as separate stems so the mixdown can duck music under the voice only.
 */
export function composeScore(timeline: HookTimeline): ComposedScore {
  const random = createRandom(seedOf(timeline));
  const durationS = timeline.durationS;
  const buses: ScoreBuses = {
    pad: createStereo(durationS),
    lead: createStereo(durationS),
    rhythm: createStereo(durationS),
    sfx: createStereo(durationS),
  };
  const kickTimesS: number[] = [];
  timeline.shots.forEach((shot, index) => {
    renderSection({ timeline, shot, next: timeline.shots[index + 1], buses, random, kickTimesS });
  });

  duckPadOnKicks(buses.pad, kickTimesS);
  const send = createStereo(durationS);
  sumInto(send, buses.pad, 0.35);
  sumInto(send, buses.lead, 0.7);
  const wet = reverb(send, { feedback: 0.84, damping: 0.3 });

  const music = createStereo(durationS);
  sumInto(music, buses.pad, 1);
  sumInto(music, buses.lead, 1);
  sumInto(music, buses.rhythm, 1);
  sumInto(music, wet, 0.9);
  automatedLowpass(music, musicCutoffAt(timeline));
  applyGain(music, silenceMask(timeline));
  applyGain(music, breathMask(timeline));
  addRoomTone(music, timeline, random);

  const fade = endFade(durationS);
  applyGain(music, fade);
  applyGain(buses.sfx, fade);
  softClipBuffer(music, 1.2);

  const scale = OUTPUT_PEAK / Math.max(peakOf(music), peakOf(buses.sfx), OUTPUT_PEAK);
  applyGain(music, () => scale);
  applyGain(buses.sfx, () => scale);
  return { music, sfx: buses.sfx };
}
