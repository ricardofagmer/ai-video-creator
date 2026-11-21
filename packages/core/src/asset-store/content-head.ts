/** Leading bytes handed to a head inspector; enough for every signature the catalog checks. */
export const CONTENT_HEAD_BYTES = 4096;

/** Throws to refuse content from its leading bytes; the store then discards the partial copy. */
export type HeadInspector = (head: Buffer) => void;

/** Collects up to `CONTENT_HEAD_BYTES` from a byte stream and inspects them exactly once. */
export class HeadCollector {
  private chunks: Buffer[] = [];
  private collected = 0;
  private inspected: boolean;

  constructor(private readonly inspect: HeadInspector | undefined) {
    this.inspected = inspect === undefined;
  }

  push(bytes: Buffer): void {
    if (this.inspected) return;
    const taken = bytes.subarray(0, CONTENT_HEAD_BYTES - this.collected);
    this.chunks.push(taken);
    this.collected += taken.byteLength;
    if (this.collected >= CONTENT_HEAD_BYTES) this.finish();
  }

  /** At end of stream: a short file is inspected with whatever it holds. */
  finish(): void {
    if (this.inspected) return;
    this.inspected = true;
    const head = Buffer.concat(this.chunks);
    this.chunks = [];
    this.inspect?.(head);
  }
}
