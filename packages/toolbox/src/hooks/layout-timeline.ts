import {
  HookTimelineSchema,
  hookSpec,
  type HookLang,
  type HookLine,
  type HookShotTiming,
  type HookTimeline,
  type HookVoiceMode,
  type WordTiming,
} from '@studio/shared/ace';
import { InputError } from '../errors';
import type { ShotEvent, ShotSpec, Storyboard } from './storyboard';

/** One synthesised narration line; word times are relative to the start of its audio clip. */
export interface VoiceClip {
  shotId: string;
  words: WordTiming[];
}

/** Where each clip starts in the final mix, so its first word lands on the line's beat. */
export interface ClipPlacement {
  shotId: string;
  offsetS: number;
}

export interface LaidOutTimeline {
  timeline: HookTimeline;
  placements: ClipPlacement[];
}

const DEFAULT_LEAD_BEATS = 1;
const DEFAULT_TAIL_BEATS = 1;

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function roundMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function spokenSpan(words: readonly WordTiming[]): { firstS: number; lastS: number } {
  const first = words[0];
  const last = words.at(-1);
  if (!first || !last) throw new InputError('a narration clip has no words');
  return { firstS: first.startS, lastS: last.endS };
}

function resolveEvent(
  shot: ShotSpec,
  eventName: string,
  event: ShotEvent,
  context: { shotStartBeat: number; beatS: number; lineWords: readonly WordTiming[] | null; lang: HookLang },
): number {
  if ('atBeat' in event) return context.shotStartBeat + event.atBeat;
  if (!context.lineWords) throw new InputError(`event ${shot.id}.${eventName} anchors to a word but the shot has no line`);
  const word = typeof event.atWord === 'string' ? event.atWord : event.atWord[context.lang];
  const target = normalizeWord(word);
  const matches = context.lineWords.filter((word) => normalizeWord(word.text) === target);
  const match = matches[(event.occurrence ?? 1) - 1];
  if (!match) throw new InputError(`event ${shot.id}.${eventName}: word "${word}" is not spoken in the line`);
  return Math.max(0, match.startS / context.beatS + (event.offsetBeats ?? 0));
}

/**
 * Lays the storyboard on the beat grid: each shot grows to fit its line, rounded to
 * `roundToBeats`; each line starts exactly on the beat after its lead.
 */
export function layoutTimeline(options: {
  storyboard: Storyboard;
  lang: HookLang;
  voice: HookVoiceMode;
  clips: readonly VoiceClip[];
}): LaidOutTimeline {
  const { storyboard, lang, voice, clips } = options;
  const beatS = 60 / storyboard.bpm;
  const clipsByShot = new Map(clips.map((clip) => [clip.shotId, clip]));
  const shots: HookShotTiming[] = [];
  const lines: HookLine[] = [];
  const placements: ClipPlacement[] = [];
  const marks: Record<string, number> = {};
  let cursorBeat = 0;

  for (const shot of storyboard.shots) {
    const lead = shot.leadBeats ?? DEFAULT_LEAD_BEATS;
    const tail = shot.tailBeats ?? DEFAULT_TAIL_BEATS;
    const clip = shot.line ? clipsByShot.get(shot.id) : undefined;
    if (shot.line && !clip) throw new InputError(`shot ${shot.id} has a line but no narration clip`);

    let beats = shot.minBeats;
    let lineWords: WordTiming[] | null = null;
    if (shot.line && clip) {
      const { firstS, lastS } = spokenSpan(clip.words);
      const lineBeats = Math.ceil((lastS - firstS) / beatS);
      beats = Math.max(beats, lead + lineBeats + tail);
      const lineStartS = (cursorBeat + lead) * beatS;
      const offsetS = lineStartS - firstS;
      placements.push({ shotId: shot.id, offsetS });
      lineWords = clip.words.map((word) => ({ text: word.text, startS: word.startS + offsetS, endS: word.endS + offsetS }));
      const lastWord = lineWords.at(-1);
      lines.push({
        shotId: shot.id,
        text: shot.line.text[lang],
        highlight: shot.line.highlight[lang],
        startS: lineStartS,
        endS: lastWord ? lastWord.endS : lineStartS,
        words: lineWords,
      });
    }
    beats = roundUp(beats, storyboard.roundToBeats);

    for (const [eventName, event] of Object.entries(shot.events ?? {})) {
      marks[`${shot.id}.${eventName}`] = resolveEvent(shot, eventName, event, { shotStartBeat: cursorBeat, beatS, lineWords, lang });
    }
    shots.push({ id: shot.id, section: shot.section, startBeat: cursorBeat, beats, startS: roundMs(cursorBeat * beatS), endS: roundMs((cursorBeat + beats) * beatS) });
    cursorBeat += beats;
  }

  const durationS = roundMs(cursorBeat * beatS);
  if (durationS < hookSpec.minDurationS || durationS > hookSpec.maxDurationS) {
    throw new InputError(`${storyboard.id} (${lang}) lays out to ${durationS.toFixed(1)} s; hooks must be ${hookSpec.minDurationS}-${hookSpec.maxDurationS} s`);
  }

  const timeline = HookTimelineSchema.parse({
    schemaVersion: 1,
    videoId: storyboard.id,
    lang,
    voice,
    bpm: storyboard.bpm,
    fps: hookSpec.fps,
    beatS,
    totalBeats: cursorBeat,
    durationS,
    shots,
    marks,
    lines,
    copy: storyboard.copy[lang],
  });
  return { timeline, placements };
}
