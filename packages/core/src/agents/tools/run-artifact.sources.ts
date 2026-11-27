import { open, readdir, stat } from 'node:fs/promises';
import { CHECKS_ARTIFACT, toolErrorHints, toolLimits, type RunArtifactId } from '@studio/shared/agents';
import {
  RunFileNotFoundError,
  readCheckResult,
  readNowFile,
  readRunEvents,
  resolveInsideRun,
} from '@studio/shared/run-files';
import {
  CheckIdSchema,
  parseStepKey,
  runFileNames,
  stageFolderName,
  type CheckResult,
  type RunFile,
  type StageId,
  type StageOutput,
  type StepKey,
} from '@studio/shared/run-format';
import { sha256Hex } from '../../asset-store';
import { toolFailure } from './tool-errors';

const TOOL = 'RunArtifactReadTool';

/** Largest artifact one call may load; also the redactor's per-string limit. */
export const MAX_ARTIFACT_CHARS = 1_000_000;
/** Recovery reads a redacted tail of this many events (topology 3.2). */
const EVENTS_TAIL_COUNT = toolLimits.runArtifactRead.eventsTailCount;
/** A stage writes one result per check and attempt; far below this. */
const MAX_CHECK_FILES = 200;
const CHECK_FILE_PATTERN = /^([a-z][a-z-]*)-([1-9][0-9]{0,2})\.json$/;

/**
 * The fixed id-to-source map of topology 3.2: every artifact is a file the engine wrote inside
 * `runs/<id>/`, located through C3 names and read through C5 readers. No path ever comes from the
 * model. Stage outputs must be recorded in `run.json` (the producing stage's `record` step).
 */
export type ArtifactSource =
  | { readonly kind: 'run-brief' }
  | { readonly kind: 'stage-output'; readonly producedBy: StageId }
  | { readonly kind: 'checks' }
  | { readonly kind: 'failed-check' }
  | { readonly kind: 'events-tail' }
  | { readonly kind: 'now' };

export const runArtifactSources: Readonly<Record<RunArtifactId, ArtifactSource>> = {
  brief: { kind: 'run-brief' },
  plan: { kind: 'stage-output', producedBy: 'plan' },
  research: { kind: 'stage-output', producedBy: 'research' },
  claims: { kind: 'stage-output', producedBy: 'verify' },
  script: { kind: 'stage-output', producedBy: 'script' },
  scenes: { kind: 'stage-output', producedBy: 'scenes' },
  'captures-index': { kind: 'stage-output', producedBy: 'capture' },
  'narration-index': { kind: 'stage-output', producedBy: 'narration' },
  'qa-metrics': { kind: 'stage-output', producedBy: 'qa' },
  checks: { kind: 'checks' },
  'failed-check': { kind: 'failed-check' },
  'events-tail': { kind: 'events-tail' },
  now: { kind: 'now' },
  'site-analysis': { kind: 'stage-output', producedBy: 'research' },
  'reference-analyses': { kind: 'stage-output', producedBy: 'script' },
};

/** Producing stage of each id, for the tool description (topology 3.3). */
export function describeArtifactSource(source: ArtifactSource): string {
  switch (source.kind) {
    case 'run-brief':
      return 'the owner brief of this run';
    case 'stage-output':
      return `produced by stage ${source.producedBy}`;
    case 'checks':
      return `verify-step check results of the stage in stageId (default: the current stage)`;
    case 'failed-check':
      return 'the latest failed check of the failed step';
    case 'events-tail':
      return `the last ${EVENTS_TAIL_COUNT} run events, redacted`;
    case 'now':
      return 'the live run snapshot';
  }
}

/** What a source read gives: the unredacted text and, for recorded outputs, the recorded hash. */
export interface ArtifactText {
  readonly text: string;
  readonly recordedHash: string | null;
}

export interface ArtifactReadRequest {
  readonly artifact: RunArtifactId;
  readonly runDir: string;
  readonly run: RunFile;
  readonly checksStageId: StageId;
  readonly stepKey: StepKey;
  /** Returns the memoized text of a recorded output, or null; lets a hit skip the file read. */
  readonly memoized: (output: StageOutput) => string | null;
}

function notProducedYet(stageId: StageId | null): never {
  throw toolFailure(TOOL, 'ERROR_NOT_PRODUCED_YET', stageId === null ? null : toolErrorHints.notProducedYet(stageId));
}

function tooLarge(): never {
  throw toolFailure(TOOL, 'ERROR_RESPONSE_TOO_LARGE', toolErrorHints.responseTooLarge);
}

function isMissing(error: unknown): boolean {
  if (error instanceof RunFileNotFoundError) return true;
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

/**
 * The recorded bytes of a stage output, or `changed` when the file no longer has the size and
 * sha-256 the `record` step wrote into `run.json`. Reads at most `sizeBytes + 1` bytes.
 */
export async function readRecordedOutput(path: string, output: StageOutput): Promise<Buffer | 'changed'> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(output.sizeBytes + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled !== output.sizeBytes) return 'changed';
    const bytes = buffer.subarray(0, filled);
    return sha256Hex(bytes) === output.contentHash ? bytes : 'changed';
  } finally {
    await handle.close();
  }
}

async function readStageOutput(request: ArtifactReadRequest, producedBy: StageId): Promise<ArtifactText> {
  const stage = request.run.stages.find((candidate) => candidate.stageId === producedBy);
  const output = stage?.outputs.find((candidate) => candidate.name === request.artifact);
  if (output === undefined) return notProducedYet(producedBy);
  if (output.sizeBytes > MAX_ARTIFACT_CHARS) return tooLarge();
  const cached = request.memoized(output);
  if (cached !== null) return { text: cached, recordedHash: output.contentHash };
  let bytes: Buffer | 'changed';
  try {
    bytes = await readRecordedOutput(resolveInsideRun(request.runDir, output.path), output);
  } catch (error) {
    if (isMissing(error)) return notProducedYet(producedBy);
    throw error;
  }
  // A file rewritten after `record` is not the output the run recorded; it is never memoized (M3).
  if (bytes === 'changed') return notProducedYet(producedBy);
  const text = bytes.toString('utf8');
  if (text.length > MAX_ARTIFACT_CHARS) return tooLarge();
  return { text, recordedHash: output.contentHash };
}

async function readStageChecks(request: ArtifactReadRequest, stageId: StageId): Promise<CheckResult[]> {
  const stage = request.run.stages.find((candidate) => candidate.stageId === stageId);
  if (stage === undefined) return notProducedYet(stageId);
  const location = { stageNumber: stage.number, stageId };
  let names: string[];
  try {
    names = await readdir(resolveInsideRun(request.runDir, `${runFileNames.checksDir}/${stageFolderName(location)}`));
  } catch (error) {
    if (isMissing(error)) return notProducedYet(stageId);
    throw error;
  }
  const locations = names.flatMap((name) => {
    const match = CHECK_FILE_PATTERN.exec(name);
    const checkId = CheckIdSchema.safeParse(match?.[1]);
    if (match === null || match[2] === undefined || !checkId.success) return [];
    return [{ ...location, checkId: checkId.data, attempt: Number.parseInt(match[2], 10) }];
  });
  if (locations.length > MAX_CHECK_FILES) return tooLarge();
  const results = await Promise.all(locations.map((checkLocation) => readCheckResult(request.runDir, checkLocation)));
  return results.sort((left, right) => left.checkId.localeCompare(right.checkId) || left.attempt - right.attempt);
}

async function readEventsTail(runDir: string): Promise<ArtifactText> {
  const eventsPath = resolveInsideRun(runDir, runFileNames.events);
  try {
    // Checked before the C5 reader loads the file, which has no size cap of its own.
    if ((await stat(eventsPath)).size > MAX_ARTIFACT_CHARS * 4) return tooLarge();
  } catch (error) {
    if (isMissing(error)) return notProducedYet(null);
    throw error;
  }
  const page = await readRunEvents(runDir);
  if (page.entries.length === 0) return notProducedYet(null);
  return { text: page.entries.slice(-EVENTS_TAIL_COUNT).map((event) => JSON.stringify(event)).join('\n'), recordedHash: null };
}

/** Reads one artifact's text through its fixed source; throws typed `ERROR_*` failures. */
export async function readArtifactText(request: ArtifactReadRequest): Promise<ArtifactText> {
  const source = runArtifactSources[request.artifact];
  switch (source.kind) {
    case 'run-brief':
      return { text: JSON.stringify(request.run.brief, null, 2), recordedHash: null };
    case 'stage-output':
      return readStageOutput(request, source.producedBy);
    case 'checks':
      return { text: JSON.stringify(await readStageChecks(request, request.checksStageId), null, 2), recordedHash: null };
    case 'failed-check': {
      // Recovery's step key is the failed step's (R1-12 AgentCallContext), so its stage is the failed one.
      const failedStageId = parseStepKey(request.stepKey).stageId;
      const failed = (await readStageChecks(request, failedStageId)).filter((result) => result.outcome === 'failed' || result.outcome === 'error');
      const latest = failed.sort((left, right) => left.attempt - right.attempt || left.startedAtMs - right.startedAtMs).at(-1);
      if (latest === undefined) return notProducedYet(failedStageId);
      return { text: JSON.stringify(latest, null, 2), recordedHash: null };
    }
    case 'events-tail':
      return readEventsTail(request.runDir);
    case 'now': {
      const now = await readNowFile(request.runDir);
      if (now.status === 'absent') return notProducedYet(null);
      return { text: JSON.stringify(now.value, null, 2), recordedHash: null };
    }
  }
}

/** True for the artifact whose `stageId` input selects the stage. */
export function usesStageIdInput(artifact: RunArtifactId): boolean {
  return artifact === CHECKS_ARTIFACT;
}
