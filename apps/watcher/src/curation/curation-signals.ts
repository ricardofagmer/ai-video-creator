import { curationBounds } from '@studio/shared/curation';

/** The two failed reasons a curation signal can name (SPEC 0005 section 5.2, C5-AC-06). */
export type CurationAbortReason = 'watcher-stopped' | 'curation-timeout';

/** A curation step stopped because its signal fired; the step ends the curation `failed`. */
export class CurationAbortedError extends Error {
  constructor(readonly reason: CurationAbortReason) {
    super(`Curation aborted: ${reason}`);
    this.name = 'CurationAbortedError';
  }
}

/**
 * The signals of one claimed curation: the 300 s whole-curation timeout, started at the claim,
 * joined to the daemon stop signal. This joined signal is the only one handed to `CuratorPort.call`;
 * the agent adds its own 120 s per-call timeout on top (SPEC 0005 section 5.5), so the call sees
 * all three. The daemon stop wins the naming, because a SIGTERM must read `watcher-stopped`.
 */
export class CurationSignals {
  readonly timeout: AbortSignal;
  readonly signal: AbortSignal;

  constructor(readonly stop: AbortSignal) {
    this.timeout = AbortSignal.timeout(curationBounds.curationTimeoutMs);
    this.signal = AbortSignal.any([stop, this.timeout]);
  }

  /** Null while neither signal fired. */
  abortReason(): CurationAbortReason | null {
    if (this.stop.aborted) return 'watcher-stopped';
    if (this.timeout.aborted) return 'curation-timeout';
    return null;
  }

  throwIfAborted(): void {
    const reason = this.abortReason();
    if (reason !== null) throw new CurationAbortedError(reason);
  }

  /**
   * Settles with `work`, or rejects with `CurationAbortedError` as soon as a signal fires. Used
   * around the SQLite reads of collect and check, which take no signal of their own: their result
   * is then ignored, and they only read.
   */
  async guard<T>(work: Promise<T>): Promise<T> {
    this.throwIfAborted();
    let rejectAborted: (error: CurationAbortedError) => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = reject;
    });
    const onAbort = (): void => rejectAborted(new CurationAbortedError(this.abortReason() ?? 'curation-timeout'));
    this.signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await Promise.race([work, aborted]);
    } finally {
      this.signal.removeEventListener('abort', onAbort);
    }
  }
}
