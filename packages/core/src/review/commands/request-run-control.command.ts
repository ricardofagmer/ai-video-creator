import { Command } from '@nestjs/cqrs';
import { type Brief } from '@studio/shared/recipes';
import { type RunId } from '@studio/shared/run-format';

/** `resume` may carry the owner's corrected brief; the watcher applies it when it takes the run. */
export type RunControlRequest = { kind: 'pause' } | { kind: 'stop' } | { kind: 'resume'; brief?: Brief };

export interface RequestRunControlInput {
  runId: RunId;
  request: RunControlRequest;
}

export interface RunControlResult {
  runId: RunId;
}

/**
 * Writes `control.json` (C3 `{ pause, stop, at }` plus the optional A6 `resume`): `pause` and
 * `stop` for a pending or running run, `resume` for a held run with no live watcher.
 */
export class RequestRunControlCommand extends Command<RunControlResult> {
  constructor(readonly input: RequestRunControlInput) {
    super();
  }
}
