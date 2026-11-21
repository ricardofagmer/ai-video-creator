import { z } from 'zod';
import { ExternalToolError } from '../errors';
import { runTool } from './exec-tool';
import { FILE_INPUT_GUARD_ARGS } from './media-tools';
import { toProbeSummary, type ProbeSummary } from './probe-mapper';

const PROBE_TIMEOUT_MS = 60_000;

// Same stream fields as ffprobe.ts plus format_name, which the media review needs for the
// container check and the absorbed probe drops.
const MediaProbeOutputSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string().optional(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      r_frame_rate: z.string().optional(),
      avg_frame_rate: z.string().optional(),
      sample_rate: z.string().optional(),
      duration: z.string().optional(),
    }),
  ),
  format: z.object({ duration: z.string().optional(), format_name: z.string().optional() }).optional(),
});

export interface MediaProbe extends ProbeSummary {
  /** ffprobe lists every demuxer alias, e.g. "mov,mp4,m4a,3gp,3g2,mj2". */
  containerNames: string[];
}

export async function probeMediaDetails(ffprobePath: string, filePath: string): Promise<MediaProbe> {
  const { stdout } = await runTool(
    ffprobePath,
    ['-v', 'error', ...FILE_INPUT_GUARD_ARGS, '-print_format', 'json', '-show_streams', '-show_format', filePath],
    PROBE_TIMEOUT_MS,
  );
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new ExternalToolError(`ffprobe returned non-JSON output for ${filePath}`, ffprobePath);
  }
  const parsed = MediaProbeOutputSchema.safeParse(raw);
  if (!parsed.success) throw new ExternalToolError(`unexpected ffprobe output for ${filePath}`, ffprobePath);
  const containerNames = (parsed.data.format?.format_name ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return { ...toProbeSummary(parsed.data), containerNames };
}
