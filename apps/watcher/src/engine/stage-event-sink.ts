import type { StageEventSink } from '@studio/shared/ports';
import { type StepKey } from '@studio/shared/run-format';
import { type ActiveRun } from './active-run';

/**
 * The C6 event sink handed to an executor for one step (SPEC 0002 rev 3). The engine stays the
 * single writer of `events.jsonl`: `ActiveRun.emit` stamps time, run and correlation ids, clips the
 * text and appends through C5, which validates the event against its C3 schema.
 */
export function stageEventSink(active: ActiveRun, stepKey: StepKey): StageEventSink {
  return {
    emit: async (event) => active.emit({ ...event, stepKey }),
  };
}
