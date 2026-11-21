import { z } from 'zod';
import { ExternalToolError } from '../errors';
import { runTool } from './exec-tool';
import { FILE_INPUT_GUARD_ARGS } from './media-tools';
import { toProbeSummary, type ProbeSummary } from './probe-mapper';

const PROBE_TIMEOUT_MS = 60_000;

const FfprobeOutputSchema = z.object({
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
  format: z.object({ duration: z.string().optional() }).optional(),
});
export type FfprobeOutput = z.infer<typeof FfprobeOutputSchema>;

export async function probeMedia(ffprobePath: string, filePath: string): Promise<ProbeSummary> {
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
  const parsed = FfprobeOutputSchema.safeParse(raw);
  if (!parsed.success) throw new ExternalToolError(`unexpected ffprobe output for ${filePath}`, ffprobePath);
  return toProbeSummary(parsed.data);
}
