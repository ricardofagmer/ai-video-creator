import { type StepKey, type StepName } from '@studio/shared/run-format';
import { postconditions } from '../owner-texts';
import { type StepFailure } from '../seams';
import { type StageWorkspace } from '../stage-workspace';

export interface StepContext {
  workspace: StageWorkspace;
  attempt: number;
  stepKey: StepKey;
  signal: AbortSignal;
}

/**
 * The engine's verdict on one step execution. Only a handler's own postcondition check produces
 * `passed`; an executor's report never does on its own (PRD 7.2, criterion 11).
 */
export type StepOutcome =
  | { kind: 'passed'; detail: string }
  | { kind: 'passed-with-caveat'; detail: string }
  | { kind: 'failed'; failure: StepFailure; detail: string };

export interface StepHandler {
  readonly step: StepName;
  run(context: StepContext): Promise<StepOutcome>;
}

export function postconditionFailed(step: StepName, detail: string): StepOutcome {
  return { kind: 'failed', failure: { origin: 'postcondition', postcondition: postconditions[step], detail }, detail };
}
