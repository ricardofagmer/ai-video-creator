import { Injectable } from '@nestjs/common';

/**
 * Serializes review writes per run inside this process, so two requests for the same run never
 * both read `review` and both write a decision. Across processes (api and CLI) the ADR 0003
 * single-writer rule and the outcome row's primary key apply.
 */
@Injectable()
export class RunLocks {
  private readonly tails = new Map<string, Promise<void>>();

  async withRun<T>(runId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(runId) ?? Promise.resolve();
    const result = previous.then(work);
    // The failure reaches its own caller through `result`; the tail only orders the next writer.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(runId, tail);
    try {
      return await result;
    } finally {
      if (this.tails.get(runId) === tail) this.tails.delete(runId);
    }
  }
}
