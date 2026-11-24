import { Logger } from '@nestjs/common';
import {
  REFERENCE_ANALYSES_FILE_NAME,
  REFERENCE_ANALYSES_MAX,
  REFERENCE_ANALYSES_OUTPUT,
  ReferenceAnalysesArtifactSchema,
  type ReferenceAnalysisEntry,
} from '@studio/shared/agents';
import type { ReferenceAnalysisReaderPort, StageExecutionContext, StagePlanningContext } from '@studio/shared/ports';
import { RunFileInvalidJsonError, RunFileSchemaError, UnsupportedRunFormatError, readRunFile } from '@studio/shared/run-files';
import { type DeclaredOutput } from '@studio/shared/run-format';
import { errorName } from '../../platform/error-name';
import { readOptionalStageInput, stageOutput, type StageOutputSink } from './stage-io';
import { stageTexts } from './stage-texts';

const JSON_MIME = 'application/json';
const logger = new Logger('ReferenceAnalysesInput');

/**
 * `script`'s optional `reference-analyses` output (guided-creation design section 4). Optional
 * (SPEC 0002 section 13.6): a run whose references have no kept analysis writes nothing.
 */
export function referenceAnalysesOutput(context: StagePlanningContext): DeclaredOutput {
  return { ...stageOutput(context.stage, REFERENCE_ANALYSES_OUTPUT, REFERENCE_ANALYSES_FILE_NAME, JSON_MIME), optional: true };
}

/**
 * The kept `done` analyses of the run's references, in `run.references` order, at most
 * `REFERENCE_ANALYSES_MAX`. Guidance only: an unreadable `run.json` or a reader failure is logged
 * (run id and error name, never analysis text) and reads as none, so the stage behaves as before
 * analyses existed.
 */
export async function readRunReferenceAnalyses(context: StageExecutionContext, reader: ReferenceAnalysisReaderPort): Promise<ReferenceAnalysisEntry[]> {
  try {
    const run = await readRunFile(context.runDir);
    if (run.references.length === 0) return [];
    const entries = await reader.readDone(run.references);
    return entries.slice(0, REFERENCE_ANALYSES_MAX);
  } catch (error) {
    logger.warn({ event: 'stage.reference-analyses-unread', runId: context.runId, stageId: context.stage.stageId, error: errorName(error) });
    return [];
  }
}

/**
 * Writes the artifact when there is at least one entry and this attempt's brief declares it. A
 * brief rendered before the output existed (a run resumed across the update) does not, and the
 * analyses then reach the packet only, never an undeclared file.
 */
export async function writeReferenceAnalyses(context: StageExecutionContext, outputs: StageOutputSink, entries: readonly ReferenceAnalysisEntry[]): Promise<void> {
  if (entries.length === 0) return;
  if (!context.stageBrief.declaredOutputs.some((declared) => declared.name === REFERENCE_ANALYSES_OUTPUT)) return;
  await outputs.writeJson(REFERENCE_ANALYSES_OUTPUT, ReferenceAnalysesArtifactSchema, { format: 1, entries: [...entries] });
}

/**
 * `scenes`' optional `reference-analyses` input, pinned by the brief when `script` recorded it.
 * Absent is normal; a file that does not match its contract is reported once and ignored, like
 * `site-analysis`.
 */
export async function readReferenceAnalysesInput(context: StageExecutionContext): Promise<ReferenceAnalysisEntry[]> {
  try {
    const artifact = await readOptionalStageInput(context, REFERENCE_ANALYSES_OUTPUT, ReferenceAnalysesArtifactSchema);
    return artifact === null ? [] : artifact.entries;
  } catch (error) {
    if (!(error instanceof RunFileSchemaError || error instanceof RunFileInvalidJsonError || error instanceof UnsupportedRunFormatError)) throw error;
    context.report({ kind: 'text', text: stageTexts.referenceAnalysesInvalid });
    return [];
  }
}

/** The packet source field: the entries when there is at least one, nothing otherwise. */
export function referenceAnalysesField(entries: readonly ReferenceAnalysisEntry[]): { referenceAnalyses?: readonly ReferenceAnalysisEntry[] } {
  return entries.length === 0 ? {} : { referenceAnalyses: entries };
}
