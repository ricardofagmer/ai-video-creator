import { type RunStatus, type StepName, type StepStatus } from '@studio/shared/run-format';
import { IllegalRunTransitionError, IllegalStepTransitionError } from './engine.errors';

/**
 * Run status moves the watcher may write (C3, PRD 7.2, ADR 0003 "Who writes what"). `draft` ->
 * `pending` and `review` -> `approved` / `rejected` belong to the api or CLI, so they are absent.
 * `running` -> `rejected` is a plan or recipe gate rejected by the owner (topology section 12);
 * `running` -> `interrupted` is also how a run found with a dead watcher is recorded before resume.
 */
const watcherRunTransitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  draft: [],
  pending: ['running'],
  // `rejected`: the watcher applies a plan-gate rejection itself (ADR 0003 writer table, amended by SPEC 0002 rev 3).
  running: ['waiting', 'paused', 'failed', 'interrupted', 'review', 'rejected'],
  waiting: ['running'],
  paused: ['running'],
  failed: ['running'],
  interrupted: ['running'],
  review: [],
  approved: [],
  rejected: [],
};

/**
 * Step status moves (C3). `running` -> `pending` is a step left to rerun (a `waiting` cause or a
 * `stop`); `failed` -> `running` is a rerun inside `limits.attemptsPerStep`.
 */
const stepTransitions: Readonly<Record<StepStatus, readonly StepStatus[]>> = {
  pending: ['running', 'skipped'],
  running: ['ok', 'warning', 'failed', 'pending'],
  failed: ['running'],
  ok: [],
  warning: [],
  skipped: [],
};

/**
 * Statuses a step may be reopened from, back to `pending`: a Recovery rerun (`ok`, `warning`,
 * `failed`), or a crash that left it `running`. A skipped step stays skipped. A reopened step keeps
 * its attempt count, so reruns stay inside `limits.attemptsPerStep`.
 */
const reopenableStepStatuses: ReadonlySet<StepStatus> = new Set<StepStatus>(['pending', 'running', 'ok', 'warning', 'failed']);

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!watcherRunTransitions[from].includes(to)) throw new IllegalRunTransitionError(from, to);
}

export function assertStepTransition(step: StepName, from: StepStatus, to: StepStatus): void {
  if (!stepTransitions[from].includes(to)) throw new IllegalStepTransitionError(step, from, to);
}

export function assertStepReopen(step: StepName, from: StepStatus): void {
  if (!reopenableStepStatuses.has(from)) throw new IllegalStepTransitionError(step, from, 'pending');
}
