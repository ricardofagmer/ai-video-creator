import {
  REFERENCE_ANALYST_PROMPT_VERSION,
  type ReferenceStyleAnalysis,
} from '@studio/shared/agents';
import {
  type AssetJobErrorCode,
  type AssetJobFile,
  type ReferenceAnalysisJobFile,
  type VoiceSampleAudio,
  type VoiceSampleEngine,
  type VoiceSampleJobFile,
} from '@studio/shared/asset-jobs';

/** The codes decided before anything is spent (`AssetJobErrorCodeSchema`'s refused group). */
export type AssetJobRefusedCode = Extract<AssetJobErrorCode, 'month-ceiling' | 'month-spend-unavailable' | 'biometric-refused' | 'not-supported'>;

/** Every other code: something was tried and did not finish. */
export type AssetJobFailedCode = Exclude<AssetJobErrorCode, AssetJobRefusedCode>;

export interface VoiceSampleResult {
  kind: 'voice-sample';
  engine: VoiceSampleEngine;
  audio: VoiceSampleAudio;
}

export interface ReferenceAnalysisResult {
  kind: 'reference-analysis';
  /** Frames actually sent to the analyst. */
  frames: number;
  analysis: ReferenceStyleAnalysis;
}

/**
 * How a claimed job ends. `usd` is what the job billed (0 in mock mode or when nothing was
 * called); a `refused` job spent nothing by definition. The analysis text goes into `job.json`
 * only, never into a log line.
 */
export type AssetJobEnding =
  | { status: 'done'; mode: 'live' | 'mock'; usd: number; result: VoiceSampleResult | ReferenceAnalysisResult }
  | { status: 'failed'; code: AssetJobFailedCode; usd: number }
  | { status: 'refused'; code: AssetJobRefusedCode };

export function refusedJob(code: AssetJobRefusedCode): AssetJobEnding {
  return { status: 'refused', code };
}

export function failedJob(code: AssetJobFailedCode, usd = 0): AssetJobEnding {
  return { status: 'failed', code, usd };
}

/** The ending's error code for a log line; null for `done`. */
export function endingCode(ending: AssetJobEnding): AssetJobErrorCode | null {
  return ending.status === 'done' ? null : ending.code;
}

/** The api's request fields plus the claim; result fields are dropped and set only by `endedFileOf`. */
function voiceRequestFields(file: VoiceSampleJobFile): VoiceSampleJobFile {
  return {
    format: file.format,
    ref: file.ref,
    kind: file.kind,
    status: file.status,
    requestedAt: file.requestedAt,
    updatedAt: file.updatedAt,
    language: file.language,
    ...(file.claim === undefined ? {} : { claim: file.claim }),
  };
}

function analysisRequestFields(file: ReferenceAnalysisJobFile): ReferenceAnalysisJobFile {
  return {
    format: file.format,
    ref: file.ref,
    kind: file.kind,
    status: file.status,
    requestedAt: file.requestedAt,
    updatedAt: file.updatedAt,
    ...(file.claim === undefined ? {} : { claim: file.claim }),
  };
}

function requestFields(file: AssetJobFile): AssetJobFile {
  return file.kind === 'voice-sample' ? voiceRequestFields(file) : analysisRequestFields(file);
}

/** The claim write: `requested` -> `running` with this process's `claim`. */
export function claimedFileOf(file: AssetJobFile, claim: { pid: number; at: string }): AssetJobFile {
  return { ...requestFields(file), status: 'running', updatedAt: claim.at, claim: { pid: claim.pid, claimedAt: claim.at } };
}

/** A result of the other kind cannot be written into this job; the step treats it as an internal bug. */
export class AssetJobResultKindMismatchError extends Error {
  constructor(readonly expected: AssetJobFile['kind']) {
    super(`Asset job result does not match the job kind: ${expected}`);
    this.name = 'AssetJobResultKindMismatchError';
  }
}

/** The final `job.json` of a claimed job. Throws `AssetJobResultKindMismatchError` for a crossed result. */
export function endedFileOf(file: AssetJobFile, ending: AssetJobEnding, at: string): AssetJobFile {
  const base = { ...requestFields(file), updatedAt: at };
  if (ending.status === 'refused') return { ...base, status: 'refused', error: { code: ending.code, at }, usd: 0 };
  if (ending.status === 'failed') return { ...base, status: 'failed', error: { code: ending.code, at }, usd: ending.usd };
  const { result } = ending;
  if (base.kind === 'voice-sample' && result.kind === 'voice-sample') {
    return { ...base, status: 'done', mode: ending.mode, usd: ending.usd, engine: result.engine, audio: result.audio };
  }
  if (base.kind === 'reference-analysis' && result.kind === 'reference-analysis') {
    return {
      ...base,
      status: 'done',
      mode: ending.mode,
      usd: ending.usd,
      promptVersion: REFERENCE_ANALYST_PROMPT_VERSION,
      frames: result.frames,
      analysis: result.analysis,
    };
  }
  throw new AssetJobResultKindMismatchError(base.kind);
}
