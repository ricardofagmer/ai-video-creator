/** Section 5.5: `state.json` gets `bytesSent` at most once a second during an upload. */
export const PROGRESS_WRITE_EVERY_MS = 1_000;

export interface UploadProgressWriterOptions {
  bytesTotal: number;
  nowMs(): number;
  /** Rewrites `state.json` (same state, new `bytesSent`). */
  write(bytesSent: number): Promise<void>;
  /** A failed progress write is logged and does not end the upload; the final write still happens. */
  onWriteFailed(error: unknown): void;
}

/**
 * Throttles the client's `onProgress` callbacks into `state.json` rewrites. Writes are chained, so
 * two never overlap, and `settle` waits for the last one before the caller writes the final state.
 */
export class UploadProgressWriter {
  private latest = 0;
  private lastWriteMs = Number.NEGATIVE_INFINITY;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly options: UploadProgressWriterOptions) {}

  report(bytesSent: number): void {
    this.latest = Math.min(Math.max(this.latest, bytesSent), this.options.bytesTotal);
    const nowMs = this.options.nowMs();
    if (nowMs - this.lastWriteMs < PROGRESS_WRITE_EVERY_MS) return;
    this.lastWriteMs = nowMs;
    const value = this.latest;
    this.chain = this.chain.then(() => this.options.write(value)).catch((error: unknown) => this.options.onWriteFailed(error));
  }

  /** Waits for the pending write and answers the highest byte count reported. */
  async settle(): Promise<number> {
    await this.chain;
    return this.latest;
  }
}
