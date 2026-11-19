import { Injectable } from '@nestjs/common';

/**
 * Serializes starts of one comparison inside this process, so two requests never both pass the
 * gate on the same `draft` pair. Across processes the ADR 0003 single-writer rule applies and the
 * run-draft service refuses a run that is no longer `draft`.
 */
@Injectable()
export class ComparisonLocks {
  private readonly tails = new Map<string, Promise<void>>();

  async withComparison<T>(comparisonId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(comparisonId) ?? Promise.resolve();
    const result = previous.then(work);
    // The failure reaches its own caller through `result`; the tail only orders the next start.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(comparisonId, tail);
    try {
      return await result;
    } finally {
      if (this.tails.get(comparisonId) === tail) this.tails.delete(comparisonId);
    }
  }
}
