import { Injectable } from '@nestjs/common';
import { KeyedMutex } from '../runtime/keyed-mutex';

/**
 * Serializes starts of one comparison inside this process, so two requests never both pass the
 * gate on the same `draft` pair. Across processes the ADR 0003 single-writer rule applies and the
 * run-draft service refuses a run that is no longer `draft`.
 */
@Injectable()
export class ComparisonLocks {
  private readonly mutex = new KeyedMutex();

  withComparison<T>(comparisonId: string, work: () => Promise<T>): Promise<T> {
    return this.mutex.run(comparisonId, work);
  }
}
