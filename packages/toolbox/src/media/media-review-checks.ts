import type { Interval } from './ffmpeg';
import type { LoudnessMeasurement } from './loudness';
import type { MediaProbe } from './media-probe';

const FPS_TOLERANCE = 0.01;

export type MediaCheckId =
  | 'container'
  | 'video-codec'
  | 'audio-codec'
  | 'resolution'
  | 'fps'
  | 'duration'
  | 'audio-present'
  | 'loudness'
  | 'true-peak'
  | 'no-black-run';

export interface MediaCheckResult {
  id: MediaCheckId;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface MediaExpectations {
  container: string;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  fps: number;
  minDurationS: number;
  maxDurationS: number;
  loudnessTargetLufs: number;
  loudnessToleranceLu: number;
  truePeakCeilingDbfs: number;
  maxBlackRunS: number;
}

export interface MediaMeasurements {
  probe: MediaProbe;
  /** null when the file has no audio stream, so nothing could be measured. */
  loudness: LoudnessMeasurement | null;
  blackRuns: Interval[];
}

function result(id: MediaCheckId, passed: boolean, detail: { expected: string; actual: string }): MediaCheckResult {
  return { id, passed, ...detail };
}

function formatRuns(runs: readonly Interval[]): string {
  return runs.map((run) => `${run.startS.toFixed(2)}-${run.endS.toFixed(2)} s`).join(', ');
}

function streamChecks(expected: MediaExpectations, probe: MediaProbe): MediaCheckResult[] {
  const { video, audio } = probe;
  return [
    result('container', probe.containerNames.includes(expected.container), {
      expected: expected.container,
      actual: probe.containerNames.join(',') || 'unknown',
    }),
    result('video-codec', video?.codec === expected.videoCodec, { expected: expected.videoCodec, actual: video?.codec ?? 'no video stream' }),
    result('audio-codec', audio?.codec === expected.audioCodec, { expected: expected.audioCodec, actual: audio?.codec ?? 'no audio stream' }),
    result('resolution', video !== null && video.width === expected.width && video.height === expected.height, {
      expected: `${expected.width}x${expected.height}`,
      actual: video ? `${video.width}x${video.height}` : 'no video stream',
    }),
    result('fps', video !== null && Math.abs(video.fps - expected.fps) < FPS_TOLERANCE, {
      expected: `${expected.fps}`,
      actual: video ? `${video.fps}` : 'no video stream',
    }),
    result('duration', probe.durationS >= expected.minDurationS && probe.durationS <= expected.maxDurationS, {
      expected: `${expected.minDurationS}-${expected.maxDurationS} s`,
      actual: `${probe.durationS.toFixed(2)} s`,
    }),
    result('audio-present', audio !== null, { expected: 'an audio stream', actual: audio ? 'present' : 'missing' }),
  ];
}

function loudnessChecks(expected: MediaExpectations, loudness: LoudnessMeasurement | null): MediaCheckResult[] {
  const integrated = loudness?.integratedLufs ?? null;
  const peak = loudness?.truePeakDbfs ?? null;
  const notMeasured = loudness === null ? 'not measured: no audio stream' : 'not found in the ebur128 summary';
  return [
    result('loudness', integrated !== null && Math.abs(integrated - expected.loudnessTargetLufs) <= expected.loudnessToleranceLu, {
      expected: `${expected.loudnessTargetLufs} LUFS +/- ${expected.loudnessToleranceLu} LU`,
      actual: integrated === null ? notMeasured : `${integrated} LUFS`,
    }),
    result('true-peak', peak !== null && peak <= expected.truePeakCeilingDbfs, {
      expected: `<= ${expected.truePeakCeilingDbfs} dBFS`,
      actual: peak === null ? notMeasured : `${peak} dBFS`,
    }),
  ];
}

/** PRD 7.3 media checks; every check blocks, so `passed` is the conjunction of all of them. */
export function mediaChecks(expected: MediaExpectations, measured: MediaMeasurements): MediaCheckResult[] {
  const longBlack = measured.blackRuns.filter((run) => run.durationS > expected.maxBlackRunS);
  return [
    ...streamChecks(expected, measured.probe),
    ...loudnessChecks(expected, measured.loudness),
    result('no-black-run', longBlack.length === 0, {
      expected: `no black run over ${expected.maxBlackRunS} s`,
      actual: longBlack.length === 0 ? 'none' : formatRuns(longBlack),
    }),
  ];
}
