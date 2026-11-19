import type { RunEvent } from '../run-format/events';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Event types a stage executor may emit; every other event belongs to the engine. */
export type StageEventType = 'session.started' | 'session.ended' | 'review.verdict';

/**
 * A C3 `events.jsonl` event as an executor hands it over: the engine stamps `atMs`, `runId`,
 * `correlationId` and the current `stepKey`. `text` must already be redacted.
 */
export type StageEventInput = DistributiveOmit<
  Extract<RunEvent, { type: StageEventType }>,
  'atMs' | 'runId' | 'correlationId' | 'stepKey'
>;

/**
 * Where an executor sends its `session.*` and `review.verdict` events (SPEC 0002 rev 3). The
 * engine validates and appends them to `events.jsonl` through C5; executors never write that file.
 */
export interface StageEventSink {
  emit(event: StageEventInput): Promise<void>;
}
