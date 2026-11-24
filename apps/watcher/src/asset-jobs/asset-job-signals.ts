import { referenceAnalysisBounds, referenceDownloadBounds, voiceSampleBounds, type AssetJobKind } from '@studio/shared/asset-jobs';

/**
 * Whole-job bound of a reference analysis: the download of a link reference's video (bounded by
 * `referenceDownloadBounds.timeoutMs`), the frame sampling (one ffprobe plus one ffmpeg per
 * frame, each bounded by `FRAME_COMMAND_TIMEOUT_MS`) and the analyst call, which adds its own
 * `callTimeoutMs` on top of this signal. The spec bounds only the call, so the job bound is the
 * sum and a stuck tool can never hold the queue longer than this.
 */
export const FRAME_COMMAND_TIMEOUT_MS = 20_000;
const REFERENCE_ANALYSIS_JOB_TIMEOUT_MS =
  referenceDownloadBounds.timeoutMs + FRAME_COMMAND_TIMEOUT_MS * (referenceAnalysisBounds.frames + 1) + referenceAnalysisBounds.callTimeoutMs;

const JOB_TIMEOUT_MS: Readonly<Record<AssetJobKind, number>> = {
  'voice-sample': voiceSampleBounds.jobTimeoutMs,
  'reference-analysis': REFERENCE_ANALYSIS_JOB_TIMEOUT_MS,
};

export type AssetJobAbortReason = 'watcher-stopped' | 'job-timeout';

/** A handler stopped because its signal fired; the step names the ending from `abortReason`. */
export class AssetJobAbortedError extends Error {
  constructor(readonly reason: AssetJobAbortReason) {
    super(`Asset job aborted: ${reason}`);
    this.name = 'AssetJobAbortedError';
  }
}

/**
 * The signals of one claimed job: its whole-job timeout, started at the claim, joined to the
 * daemon stop signal. The joined signal is the only one a handler hands to a tool, an engine or
 * the analyst. The daemon stop wins the naming, because a SIGTERM is not the job's fault.
 */
export class AssetJobSignals {
  readonly timeout: AbortSignal;
  readonly signal: AbortSignal;

  constructor(
    readonly stop: AbortSignal,
    kind: AssetJobKind,
  ) {
    this.timeout = AbortSignal.timeout(JOB_TIMEOUT_MS[kind]);
    this.signal = AbortSignal.any([stop, this.timeout]);
  }

  /** Null while neither signal fired. */
  abortReason(): AssetJobAbortReason | null {
    if (this.stop.aborted) return 'watcher-stopped';
    if (this.timeout.aborted) return 'job-timeout';
    return null;
  }

  throwIfAborted(): void {
    const reason = this.abortReason();
    if (reason !== null) throw new AssetJobAbortedError(reason);
  }
}
