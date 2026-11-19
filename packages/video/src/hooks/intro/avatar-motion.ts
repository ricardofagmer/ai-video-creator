import type { HookLine } from '@studio/shared/ace';
import type { AvatarPose } from './Avatar';

const SYLLABLES_PER_S = 5.5;
const BLINK_FRAMES = 5;
/** Blink starts, in frames, repeating: irregular so it never reads as a metronome. */
const BLINK_PATTERN = [38, 131, 150, 238, 331] as const;
const BLINK_CYCLE = 360;

function spokenWordAt(lines: readonly HookLine[], timeS: number): { startS: number; endS: number } | null {
  for (const line of lines) {
    if (timeS < line.startS - 0.05 || timeS > line.endS + 0.05) continue;
    const word = line.words.find((candidate) => timeS >= candidate.startS && timeS < candidate.endS);
    if (word) return word;
  }
  return null;
}

/** Mouth opening from the word timings: open on each syllable inside a spoken word. */
export function mouthOpenAt(lines: readonly HookLine[], timeS: number): number {
  const word = spokenWordAt(lines, timeS);
  if (!word) return 0;
  const progress = (timeS - word.startS) / Math.max(0.05, word.endS - word.startS);
  const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
  const syllable = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * SYLLABLES_PER_S * (timeS - word.startS)));
  return Math.min(1, envelope * syllable * 1.1);
}

export function isTalking(lines: readonly HookLine[], timeS: number): boolean {
  return lines.some((line) => timeS >= line.startS && timeS <= line.endS);
}

export function eyeOpenAt(frame: number): number {
  const inCycle = frame % BLINK_CYCLE;
  for (const start of BLINK_PATTERN) {
    const into = inCycle - start;
    if (into >= 0 && into < BLINK_FRAMES) return Math.abs(into - (BLINK_FRAMES - 1) / 2) / ((BLINK_FRAMES - 1) / 2);
  }
  return 1;
}

/** Full pose for a frame; `look` is where the scene wants his eyes (e.g. at a card). */
export function avatarPoseAt(options: { lines: readonly HookLine[]; frame: number; fps: number; look: AvatarPose['look'] }): AvatarPose {
  const timeS = options.frame / options.fps;
  const talking = isTalking(options.lines, timeS);
  const idleTilt = 1.2 * Math.sin(timeS * 0.9);
  const talkTilt = talking ? 1.6 * Math.sin(timeS * 2.7) : 0;
  const nod = talking ? 2.5 * Math.max(0, Math.sin(timeS * 4.1)) : 0;
  return {
    mouthOpen: mouthOpenAt(options.lines, timeS),
    eyeOpen: eyeOpenAt(options.frame),
    tiltDeg: idleTilt + talkTilt,
    nodPx: nod,
    look: options.look,
    breath: 0.5 + 0.5 * Math.sin(timeS * 1.6),
  };
}
