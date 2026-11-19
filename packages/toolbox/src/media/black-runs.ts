import { runTool } from './exec-tool';
import type { Interval } from './ffmpeg';
import { ANALYSIS_TIMEOUT_MS, formatSeconds } from './media-tools';

const BLACK_PATTERN = /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g;

/**
 * Black runs of at least `minDurationS` on the first video stream. Video only, so a file with no
 * audio stream is still analysed (ffmpeg.ts pairs blackdetect with silencedetect).
 */
export async function detectBlackRuns(ffmpegPath: string, filePath: string, minDurationS: number): Promise<Interval[]> {
  const { stderr } = await runTool(
    ffmpegPath,
    ['-hide_banner', '-nostats', '-nostdin', '-i', filePath, '-map', '0:v:0', '-vf', `blackdetect=d=${formatSeconds(minDurationS)}`, '-an', '-f', 'null', '-'],
    ANALYSIS_TIMEOUT_MS,
  );
  return Array.from(stderr.matchAll(BLACK_PATTERN), (match) => ({
    startS: Number.parseFloat(match[1] ?? '0'),
    endS: Number.parseFloat(match[2] ?? '0'),
    durationS: Number.parseFloat(match[3] ?? '0'),
  }));
}
