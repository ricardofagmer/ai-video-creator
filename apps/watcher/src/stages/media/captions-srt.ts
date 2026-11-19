import { type NarrationIndex } from '../shared/stage-artifacts';

type WordTiming = NarrationIndex['words'][number];

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

/** Short cues read on a phone: at most this many words or this long, whichever comes first. */
const MAX_WORDS_PER_CUE = 6;
const MAX_CUE_MS = 2500;
const WORDS_PER_LINE = 3;

/** Groups the narration's word timings into caption cues, each split over at most `maxLines` lines. */
export function captionCues(words: readonly WordTiming[], maxLines: number): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let group: WordTiming[] = [];
  const flush = (): void => {
    const first = group[0];
    const last = group[group.length - 1];
    if (first !== undefined && last !== undefined) {
      cues.push({ startMs: Math.round(first.startS * 1000), endMs: Math.round(last.endS * 1000), text: linesOf(group, maxLines) });
    }
    group = [];
  };
  for (const word of words) {
    const first = group[0];
    if (first !== undefined && (group.length >= MAX_WORDS_PER_CUE || (word.endS - first.startS) * 1000 > MAX_CUE_MS)) flush();
    group.push(word);
  }
  flush();
  return cues;
}

function linesOf(group: readonly WordTiming[], maxLines: number): string {
  const perLine = Math.max(WORDS_PER_LINE, Math.ceil(group.length / maxLines));
  const lines: string[] = [];
  for (let index = 0; index < group.length; index += perLine) {
    lines.push(group.slice(index, index + perLine).map((word) => word.text).join(' '));
  }
  return lines.join('\n');
}

function srtTime(totalMs: number): string {
  const pad = (value: number, size: number): string => String(value).padStart(size, '0');
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(totalMs % 1000, 3)}`;
}

export function toSrt(cues: readonly CaptionCue[]): string {
  return cues.map((cue, index) => `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(Math.max(cue.endMs, cue.startMs + 1))}\n${cue.text}\n`).join('\n');
}

const SRT_TIME = /^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})$/;

function parseSrtStarts(srt: string): number[] {
  const starts: number[] = [];
  for (const line of srt.split(/\r?\n/)) {
    const match = SRT_TIME.exec(line.trim());
    if (match === null) continue;
    const [hours, minutes, seconds, millis] = match.slice(1, 5).map((part) => Number.parseInt(part, 10));
    starts.push((hours ?? 0) * 3_600_000 + (minutes ?? 0) * 60_000 + (seconds ?? 0) * 1000 + (millis ?? 0));
  }
  return starts;
}

export type CaptionDrift =
  | { status: 'measured'; driftMs: number }
  | { status: 'no-cues' }
  | { status: 'cue-count-mismatch'; written: number; expected: number };

/**
 * Largest gap between a written cue's start and the narration word it should start on, measured
 * on the SRT file as written, so a file edited or truncated after the stage is caught.
 */
export function captionDrift(srt: string, words: readonly WordTiming[], maxLines: number): CaptionDrift {
  const written = parseSrtStarts(srt);
  const expected = captionCues(words, maxLines).map((cue) => cue.startMs);
  if (written.length === 0) return { status: 'no-cues' };
  if (written.length !== expected.length) return { status: 'cue-count-mismatch', written: written.length, expected: expected.length };
  const driftMs = written.reduce((largest, start, index) => Math.max(largest, Math.abs(start - (expected[index] ?? start))), 0);
  return { status: 'measured', driftMs };
}
