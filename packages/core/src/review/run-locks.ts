import { Injectable } from '@nestjs/common';
import { KeyedMutex } from '../runtime/keyed-mutex';

/**
 * Serializes review writes per run inside this process, so two requests for the same run never
 * both read `review` and both write a decision. Across processes (api and CLI) the ADR 0003
 * single-writer rule and the outcome row's primary key apply.
 */
@Injectable()
export class RunLocks {
  private readonly mutex = new KeyedMutex();

  withRun<T>(runId: string, work: () => Promise<T>): Promise<T> {
    return this.mutex.run(runId, work);
  }
}
