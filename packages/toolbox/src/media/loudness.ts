import { runTool } from './exec-tool';
import { ANALYSIS_TIMEOUT_MS } from './media-tools';

export interface LoudnessMeasurement {
  integratedLufs: number | null;
  truePeakDbfs: number | null;
}

function readNumber(pattern: RegExp, text: string): number | null {
  const captured = pattern.exec(text)?.[1];
  if (captured === undefined) return null;
  const value = Number.parseFloat(captured);
  return Number.isFinite(value) ? value : null;
}

/**
 * Integrated loudness and true peak of the first audio stream, read from the ebur128 summary
 * (port of video_tool.py `measure_loudness`). The filter logs at info level, so no -loglevel error.
 */
export async function measureLoudness(ffmpegPath: string, filePath: string): Promise<LoudnessMeasurement> {
  const { stderr } = await runTool(
    ffmpegPath,
    ['-hide_banner', '-nostats', '-nostdin', '-i', filePath, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    ANALYSIS_TIMEOUT_MS,
  );
  const summaryStart = stderr.lastIndexOf('Summary:');
  if (summaryStart < 0) return { integratedLufs: null, truePeakDbfs: null };
  const summary = stderr.slice(summaryStart);
  return {
    integratedLufs: readNumber(/I:\s*(-?[\d.]+) LUFS/, summary),
    truePeakDbfs: readNumber(/Peak:\s*(-?[\d.]+) dBFS/, summary),
  };
}
