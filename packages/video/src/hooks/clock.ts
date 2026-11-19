import { Easing, interpolate } from 'remotion';
import type { HookSection, HookTimeline } from '@studio/shared/ace';

/** Beat-grid helpers: every hook animation is placed in beats, so picture and score agree. */
export interface HookClock {
  frame: number;
  beat: number;
  beatToFrame: (beat: number) => number;
  /** Absolute beat of a storyboard mark, or the fallback when the mark is absent. */
  mark: (name: string, fallback?: number) => number;
  /** 0 before `startBeat`, 1 after `startBeat + lengthBeats`, eased in between. */
  progress: (startBeat: number, lengthBeats: number, easing?: (input: number) => number) => number;
  section: HookSection;
  shotId: string;
}

export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const whip = Easing.bezier(0.85, 0, 0.15, 1);

export function createClock(timeline: HookTimeline, frame: number): HookClock {
  const framesPerBeat = timeline.beatS * timeline.fps;
  const beat = frame / framesPerBeat;
  const shot = [...timeline.shots].reverse().find((candidate) => candidate.startBeat <= beat) ?? timeline.shots[0];
  return {
    frame,
    beat,
    beatToFrame: (value) => value * framesPerBeat,
    mark: (name, fallback = Number.POSITIVE_INFINITY) => timeline.marks[name] ?? fallback,
    progress: (startBeat, lengthBeats, easing = easeInOut) =>
      interpolate(beat, [startBeat, startBeat + Math.max(lengthBeats, 0.0001)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing,
      }),
    section: shot?.section ?? 'intro',
    shotId: shot?.id ?? '',
  };
}

/** Start beat of a shot by id (end of timeline when absent). */
export function shotStart(timeline: HookTimeline, shotId: string): number {
  return timeline.shots.find((shot) => shot.id === shotId)?.startBeat ?? timeline.totalBeats;
}

export function copyText(timeline: HookTimeline, key: string): string {
  return timeline.copy[key] ?? '';
}
