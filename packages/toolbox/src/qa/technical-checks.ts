import { videoSpec, type QaCheck } from '@studio/shared/ace';
import type { DetectionReport } from '../media/ffmpeg';
import type { ProbeSummary } from '../media/probe-mapper';

const MAX_BLACK_S = 1;
const MAX_SILENCE_S = 2;
const FPS_TOLERANCE = 0.01;

function check(id: string, passed: boolean, detail: string): QaCheck {
  return { id, passed, blocking: true, detail: detail.slice(0, 1000) };
}

function formatIntervals(intervals: DetectionReport['black']): string {
  return intervals.map((interval) => `${interval.startS.toFixed(2)}-${interval.endS.toFixed(2)} s`).join(', ');
}

/** Spec §6 technical gate, every check blocking. */
export function technicalChecks(probe: ProbeSummary, detection: DetectionReport): QaCheck[] {
  const { video, audio } = probe;
  const longBlack = detection.black.filter((interval) => interval.durationS > MAX_BLACK_S);
  const longSilence = detection.silence.filter((interval) => interval.durationS > MAX_SILENCE_S);
  return [
    check(
      'duration',
      probe.durationS >= videoSpec.minDurationS && probe.durationS <= videoSpec.maxDurationS,
      `${probe.durationS.toFixed(2)} s (needs ${videoSpec.minDurationS}-${videoSpec.maxDurationS} s)`,
    ),
    check(
      'resolution',
      video !== null && video.width === videoSpec.width && video.height === videoSpec.height,
      video ? `${video.width}x${video.height} (needs ${videoSpec.width}x${videoSpec.height})` : 'no video stream',
    ),
    check(
      'fps',
      video !== null && Math.abs(video.fps - videoSpec.fps) < FPS_TOLERANCE,
      video ? `${video.fps} fps (needs ${videoSpec.fps})` : 'no video stream',
    ),
    check('video-codec', video?.codec === 'h264', `video codec ${video?.codec ?? 'missing'} (needs h264)`),
    check('audio-codec', audio?.codec === 'aac', `audio codec ${audio?.codec ?? 'missing'} (needs aac)`),
    check(
      'audio-sample-rate',
      audio?.sampleRate === videoSpec.audioSampleRate,
      `audio ${audio?.sampleRate ?? 0} Hz (needs ${videoSpec.audioSampleRate})`,
    ),
    check(
      'no-black-frames',
      longBlack.length === 0,
      longBlack.length === 0 ? `no black segment over ${MAX_BLACK_S} s` : `black over ${MAX_BLACK_S} s at ${formatIntervals(longBlack)}`,
    ),
    check(
      'no-silence',
      longSilence.length === 0,
      longSilence.length === 0
        ? `no silence over ${MAX_SILENCE_S} s at -50 dB`
        : `silence over ${MAX_SILENCE_S} s at ${formatIntervals(longSilence)}`,
    ),
  ];
}
