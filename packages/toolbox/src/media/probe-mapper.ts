import type { FfprobeOutput } from './ffprobe';

export interface ProbeSummary {
  durationS: number;
  video: { codec: string; width: number; height: number; fps: number } | null;
  audio: { codec: string; sampleRate: number } | null;
}

/** "30/1" or "30000/1001" -> frames per second, rounded to 3 decimals. */
function parseFrameRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [numerator, denominator] = rate.split('/').map((part) => Number.parseFloat(part));
  if (numerator === undefined || !Number.isFinite(numerator)) return 0;
  const divisor = denominator !== undefined && Number.isFinite(denominator) && denominator !== 0 ? denominator : 1;
  return Math.round((numerator / divisor) * 1000) / 1000;
}

function parseSeconds(value: string | undefined): number {
  const seconds = value === undefined ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(seconds) ? seconds : 0;
}

export function toProbeSummary(output: FfprobeOutput): ProbeSummary {
  const videoStream = output.streams.find((stream) => stream.codec_type === 'video');
  const audioStream = output.streams.find((stream) => stream.codec_type === 'audio');
  return {
    durationS: parseSeconds(output.format?.duration ?? videoStream?.duration),
    video: videoStream
      ? {
          codec: videoStream.codec_name ?? 'unknown',
          width: videoStream.width ?? 0,
          height: videoStream.height ?? 0,
          fps: parseFrameRate(videoStream.avg_frame_rate !== '0/0' ? videoStream.avg_frame_rate : videoStream.r_frame_rate),
        }
      : null,
    audio: audioStream
      ? { codec: audioStream.codec_name ?? 'unknown', sampleRate: Number.parseInt(audioStream.sample_rate ?? '0', 10) || 0 }
      : null,
  };
}
