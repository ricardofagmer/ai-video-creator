import { runTool } from './exec-tool';

const DETECT_TIMEOUT_MS = 10 * 60_000;
const ENCODE_TIMEOUT_MS = 10 * 60_000;

export interface Interval {
  startS: number;
  endS: number;
  durationS: number;
}

export interface DetectionReport {
  black: Interval[];
  silence: Interval[];
}

function parseBlack(log: string): Interval[] {
  const pattern = /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g;
  return Array.from(log.matchAll(pattern), (match) => ({
    startS: Number.parseFloat(match[1] ?? '0'),
    endS: Number.parseFloat(match[2] ?? '0'),
    durationS: Number.parseFloat(match[3] ?? '0'),
  }));
}

/** silencedetect prints start and end on separate lines; a trailing silence has no end line. */
function parseSilence(log: string, totalDurationS: number): Interval[] {
  const intervals: Interval[] = [];
  let openStart: number | null = null;
  for (const line of log.split('\n')) {
    const start = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (start) openStart = Number.parseFloat(start[1] ?? '0');
    const end = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/.exec(line);
    if (end) {
      const endS = Number.parseFloat(end[1] ?? '0');
      const durationS = Number.parseFloat(end[2] ?? '0');
      intervals.push({ startS: openStart ?? endS - durationS, endS, durationS });
      openStart = null;
    }
  }
  if (openStart !== null) intervals.push({ startS: openStart, endS: totalDurationS, durationS: totalDurationS - openStart });
  return intervals;
}

/** Black frames longer than 1 s and silences longer than 2 s at -50 dB. */
export async function detectBlackAndSilence(ffmpegPath: string, videoPath: string, totalDurationS: number): Promise<DetectionReport> {
  const { stderr } = await runTool(
    ffmpegPath,
    ['-hide_banner', '-nostats', '-i', videoPath, '-vf', 'blackdetect=d=1.0', '-af', 'silencedetect=n=-50dB:d=2', '-f', 'null', '-'],
    DETECT_TIMEOUT_MS,
  );
  return { black: parseBlack(stderr), silence: parseSilence(stderr, totalDurationS) };
}

/**
 * 720x1280 review copy. maxrate 850 kbit/s video + 96 kbit/s audio keeps a 90 s clip
 * near 10.6 MB, under the 12 MB artifact-page budget.
 */
export async function encodePreview(ffmpegPath: string, inputPath: string, outputPath: string): Promise<void> {
  await runTool(
    ffmpegPath,
    [
      '-hide_banner', '-nostats', '-y', '-i', inputPath,
      '-vf', 'scale=720:1280',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '28', '-maxrate', '850k', '-bufsize', '1700k', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      outputPath,
    ],
    ENCODE_TIMEOUT_MS,
  );
}
