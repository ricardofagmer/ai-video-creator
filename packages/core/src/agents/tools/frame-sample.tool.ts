import { realpath } from 'node:fs/promises';
import { z } from 'zod';
import {
  CAPTURES_INDEX_ARTIFACT,
  CAPTURE_FRAME_SOURCE,
  FrameSampleInputSchema,
  QA_METRICS_ARTIFACT,
  frameLabel,
  toolErrorHints,
  toolLimits,
  type FrameSampleInput,
} from '@studio/shared/agents';
import { SensitivitySchema } from '@studio/shared/catalog';
import { RunPathOutsideRunError, readRunFile, readTextFile, resolveInsideRun } from '@studio/shared/run-files';
import { RelativePathSchema, type RunFile, type StageId } from '@studio/shared/run-format';
import { isInsideOrEqual } from '../../asset-store';
import { type RedactorService } from '../../redaction';
import { AgentRunError } from '../agents.errors';
import { biometricPathState } from './biometric-guard';
import { extractJpegFrame, probeDurationMs, type ProcessOutcome, type ProcessSignals } from './ffmpeg-frames';
import { toolFailure } from './tool-errors';
import { FrameSampleEnvelopeSchema, JPEG_MEDIA_TYPE, type SampledFrame } from './tool-results';
import { type GuardedTool, type ToolCall, type ToolSuccess } from './tool-wrapper';

const TOOL = 'FrameSampleTool';
const { framesPerStep, ffmpegTimeoutMs } = toolLimits.frameSample;
const HINT_TAIL_CHARS = 280;

/**
 * The fields FrameSampleTool needs from a `captures-index` entry. The full index schema belongs to
 * the capture stage; extra fields pass through untouched. `path` is relative to the run folder.
 */
const CaptureMediaIndexSchema = z
  .object({
    captures: z
      .array(
        z
          .object({ captureId: z.string().min(1).max(200), path: RelativePathSchema.optional(), sensitivity: SensitivitySchema.optional() })
          .passthrough(),
      )
      .max(500),
  })
  .passthrough();

/** Recorded videos a render review can sample, newest pipeline stage first (SPEC 0002 A5 order). */
const RENDER_OUTPUTS: readonly { readonly stageId: StageId; readonly name: string }[] = [
  { stageId: 'music', name: 'music' },
  { stageId: 'fades', name: 'fades' },
  { stageId: 'composition', name: 'composition' },
];
const VIDEO_EXTENSION = '.mp4';

interface FrameSource {
  readonly path: string;
  /** Recorded hash that identifies the media in the memo key. */
  readonly contentHash: string;
}

function sourceNotFound(): never {
  throw toolFailure(TOOL, 'ERROR_SOURCE_NOT_FOUND');
}

function recordedOutput(run: RunFile, stageId: StageId, name: string): { path: string; contentHash: string } | undefined {
  return run.stages.find((stage) => stage.stageId === stageId)?.outputs.find((output) => output.name === name);
}

async function captureSource(runDir: string, run: RunFile, captureId: string): Promise<FrameSource> {
  const index = recordedOutput(run, 'capture', CAPTURES_INDEX_ARTIFACT);
  if (index === undefined) return sourceNotFound();
  let indexJson: unknown;
  try {
    indexJson = JSON.parse(await readTextFile(resolveInsideRun(runDir, index.path)));
  } catch {
    // An unreadable or non-JSON index is a missing source for this tool; the stage's own verify reports it.
    return sourceNotFound();
  }
  const parsed = CaptureMediaIndexSchema.safeParse(indexJson);
  const entry = parsed.success ? parsed.data.captures.find((capture) => capture.captureId === captureId) : undefined;
  if (entry === undefined || entry.path === undefined || entry.sensitivity === 'biometric') return sourceNotFound();
  return { path: resolveInsideRun(runDir, entry.path), contentHash: `${index.contentHash}:${captureId}` };
}

function renderSource(runDir: string, run: RunFile): FrameSource {
  for (const candidate of RENDER_OUTPUTS) {
    const output = recordedOutput(run, candidate.stageId, candidate.name);
    if (output !== undefined && output.path.endsWith(VIDEO_EXTENSION)) {
      return { path: resolveInsideRun(runDir, output.path), contentHash: output.contentHash };
    }
  }
  return sourceNotFound();
}

const DESCRIPTION =
  'Sample frames as JPEG images from this run\'s capture or its recorded render at given timestamps. ' +
  `source=capture needs a captureId from ${CAPTURES_INDEX_ARTIFACT}; timestamps are ascending milliseconds within the duration shown in ` +
  `${CAPTURES_INDEX_ARTIFACT} or ${QA_METRICS_ARTIFACT}. At most ${toolLimits.frameSample.framesPerCall} frames per call and ${framesPerStep} per step; pick key moments.`;

export interface FrameSampleDependencies {
  readonly redactor: RedactorService;
}

/**
 * FrameSampleTool (topology 3.2): a fixed source map (render from `run.json`, capture from
 * `captures-index` by captureId), every path kept inside the run folder after following symlinks,
 * biometric-registered paths refused as not found, ffprobe and ffmpeg through `execFile` with a
 * fixed argv, numeric `-ss`, local files only, a minimal env and one 20 s deadline per call, and
 * the per-step frame counter enforced server-side. Frames go to memory only.
 */
export function frameSampleTool(dependencies: FrameSampleDependencies): GuardedTool<FrameSampleInput, { frames: SampledFrame[] }, null> {
  async function ffmpegFailure(outcome: Exclude<ProcessOutcome, { status: 'ok' }>, sourcePaths: readonly string[], call: ToolCall): Promise<never> {
    if (outcome.status === 'aborted') throw new AgentRunError(call.scope.role, { kind: 'cancelled' });
    if (outcome.reason === 'not-installed') throw toolFailure(TOOL, 'ERROR_FFMPEG_FAILED', 'ffmpeg is not installed on this machine');
    if (outcome.reason === 'timed-out') throw toolFailure(TOOL, 'ERROR_FFMPEG_FAILED', `ffmpeg timed out after ${ffmpegTimeoutMs / 1000} s; ask for fewer frames`);
    // Paths are internal details; secrets and biometric paths are redacted; a redactor error drops the tail.
    const withoutPaths = sourcePaths.reduce((text, path) => text.split(path).join('<source>'), outcome.stderrTail);
    const redacted = await dependencies.redactor.redactText(withoutPaths);
    throw toolFailure(TOOL, 'ERROR_FFMPEG_FAILED', redacted.status === 'redacted' && redacted.value.trim() !== '' ? redacted.value.trim().slice(-HINT_TAIL_CHARS) : null);
  }

  async function guardedSourcePath(source: FrameSource, call: ToolCall): Promise<string> {
    let realSource: string;
    let realRunDir: string;
    try {
      realSource = await realpath(source.path);
      realRunDir = await realpath(call.scope.runDir);
    } catch {
      return sourceNotFound();
    }
    if (!isInsideOrEqual(realRunDir, realSource) || realSource === realRunDir) return sourceNotFound();
    for (const candidate of new Set([source.path, realSource])) {
      if ((await biometricPathState(dependencies.redactor, candidate)) !== 'clear') return sourceNotFound();
    }
    return realSource;
  }

  return {
    name: TOOL,
    description: DESCRIPTION,
    inputSchema: FrameSampleInputSchema,
    envelopeSchema: FrameSampleEnvelopeSchema,
    invalidInput: (issues) =>
      issues.some((issue) => issue.path[0] === 'source' || issue.path[0] === 'captureId')
        ? toolFailure(TOOL, 'ERROR_SOURCE_NOT_FOUND', 'source is capture (with a captureId) or render')
        : toolFailure(TOOL, 'ERROR_TIMESTAMP_OUT_OF_RANGE', `1 to ${toolLimits.frameSample.framesPerCall} ascending integer timestamps; width 512 or 768`),

    async run(input, call): Promise<ToolSuccess<{ frames: SampledFrame[] }, null>> {
      const { scope } = call;
      let run: RunFile;
      try {
        run = await readRunFile(scope.runDir);
      } catch {
        throw new AgentRunError(scope.role, { kind: 'internal' });
      }
      const captureId = input.source === CAPTURE_FRAME_SOURCE ? input.captureId : undefined;
      if (input.source === CAPTURE_FRAME_SOURCE && captureId === undefined) return sourceNotFound();
      let source: FrameSource;
      try {
        source = captureId === undefined ? renderSource(scope.runDir, run) : await captureSource(scope.runDir, run, captureId);
      } catch (error) {
        // resolveInsideRun refuses a recorded path that would leave the run folder.
        if (error instanceof RunPathOutsideRunError) return sourceNotFound();
        throw error;
      }
      const sourcePath = await guardedSourcePath(source, call);
      const signals: ProcessSignals = { caller: scope.signal, deadline: AbortSignal.timeout(ffmpegTimeoutMs) };

      const duration = await probeDurationMs(sourcePath, signals);
      if (duration.status !== 'ok') return ffmpegFailure(duration, [source.path, sourcePath], call);
      if (input.timestampsMs.some((timestamp) => timestamp >= duration.durationMs)) {
        throw toolFailure(TOOL, 'ERROR_TIMESTAMP_OUT_OF_RANGE', toolErrorHints.timestampOutOfRange(duration.durationMs));
      }
      const count = input.timestampsMs.length;
      if (!call.state.reserveFrames(count, framesPerStep)) throw toolFailure(TOOL, 'ERROR_FRAME_BUDGET_EXCEEDED', toolErrorHints.frameBudgetExceeded(framesPerStep));

      const frames: SampledFrame[] = [];
      try {
        for (const timestampMs of input.timestampsMs) {
          const memoKey = `${scope.runId}::${input.source}::${captureId ?? '-'}::${source.contentHash}::${timestampMs}::${input.width}`;
          const memoized = call.state.frames.get(memoKey);
          if (memoized !== undefined) {
            frames.push(memoized);
            continue;
          }
          const extracted = await extractJpegFrame({ sourcePath, timestampMs, maxEdgePx: input.width }, signals);
          if (extracted.status !== 'ok') return await ffmpegFailure(extracted, [source.path, sourcePath], call);
          const frame: SampledFrame = {
            label: frameLabel(timestampMs, input.source, captureId),
            mediaType: JPEG_MEDIA_TYPE,
            maxEdgePx: input.width,
            dataBase64: extracted.stdout.toString('base64'),
          };
          call.state.frames.set(memoKey, frame);
          frames.push(frame);
        }
      } catch (error) {
        // Frames the model never received do not count against its step budget.
        call.state.releaseFrames(count);
        throw error;
      }
      return {
        dsl: `frame.sample source=${input.source}${captureId === undefined ? '' : ` captureId=${captureId}`} t=${input.timestampsMs.join(',')} width=${input.width}`,
        result: { frames },
        handoff: null,
        pagination: null,
        preview: frames.map((frame) => frame.label).join('\n'),
      };
    },
  };
}
