import { assessAppLocation } from './app-location';
import { type SetupLogger } from './setup-log';
import {
  type OptionalComponentsReport,
  type SetupInteraction,
  type SetupProgress,
  type SetupStep,
  type SetupStepId,
  type StepFailureReason,
  type StepReport,
  type StepRunResult,
} from './setup-types';

/*
 * Runs step 0, then the nine steps in order (plan section 5). Each step is asked first whether it is
 * done; only a step that answers `needed` runs, so a second run reports every step as already done
 * and changes nothing (DI-AC-02). A required step that fails stops setup; retry is a new run of the
 * whole sequence, which skips what is already done.
 */

export interface SetupPlan {
  readonly steps: readonly SetupStep[];
  /** C1 report of the optional components, read once the steps finished. */
  components(): Promise<OptionalComponentsReport>;
}

export interface SetupRunOptions {
  /** The running `.app` bundle path; step 0 refuses an unstable location (DI-AC-24). */
  readonly appBundlePath: string;
  /** The window's port; wrapped so the step that asks is shown as waiting for the user. */
  readonly interaction: SetupInteraction;
  readonly createPlan: (interaction: SetupInteraction) => SetupPlan;
  readonly log: SetupLogger;
  readonly onProgress: (progress: SetupProgress) => void;
}

class ProgressBoard {
  private reports: StepReport[] = [];
  private current: SetupStepId | null = null;

  constructor(private readonly onProgress: (progress: SetupProgress) => void) {}

  /** Called once the plan is known; the plan is built after the board so its steps can ask through it. */
  begin(ids: readonly SetupStepId[]): void {
    this.reports = ids.map((id) => ({ id, status: 'pending' }));
    this.onProgress({ phase: 'running', steps: this.steps });
  }

  get steps(): readonly StepReport[] {
    return [...this.reports];
  }

  set(report: StepReport): void {
    const index = this.reports.findIndex((entry) => entry.id === report.id);
    if (index >= 0) this.reports[index] = report;
    this.current = report.status === 'checking' || report.status === 'running' || report.status === 'waiting-for-user' ? report.id : null;
    this.onProgress({ phase: 'running', steps: this.steps });
  }

  /** Marks the step in progress as waiting while `ask` is pending, then as running again. */
  async whileWaiting<T>(ask: () => Promise<T>): Promise<T> {
    const id = this.current;
    if (id !== null) this.set({ id, status: 'waiting-for-user' });
    try {
      return await ask();
    } finally {
      if (id !== null) this.set({ id, status: 'running' });
    }
  }
}

function trackedInteraction(inner: SetupInteraction, board: ProgressBoard): SetupInteraction {
  return {
    requestPassphrase: () => board.whileWaiting(() => inner.requestPassphrase()),
    requestConsent: (offer) => board.whileWaiting(() => inner.requestConsent(offer)),
  };
}

type StepOutcome = { readonly kind: 'continue' } | { readonly kind: 'stop'; readonly reason: StepFailureReason };

/** A thrown error is a failed step, never an unhandled rejection that leaves the window spinning. */
async function guarded<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

const UNEXPECTED: StepRunResult = { kind: 'failed', reason: 'unexpected-error' };

async function runOneStep(step: SetupStep, board: ProgressBoard, log: SetupLogger): Promise<StepOutcome> {
  board.set({ id: step.id, status: 'checking' });
  const check = await guarded(() => step.check(), { kind: 'needed' } as const);
  if (check.kind === 'done') {
    board.set({ id: step.id, status: 'already-done' });
    log({ event: 'step-already-done', step: step.id });
    return { kind: 'continue' };
  }
  board.set({ id: step.id, status: 'running' });
  const result = await guarded(() => step.run(), UNEXPECTED);
  if (result.kind === 'done') {
    board.set({ id: step.id, status: 'done' });
    log({ event: 'step-done', step: step.id });
    return { kind: 'continue' };
  }
  if (result.kind === 'failed' && step.required) {
    board.set({ id: step.id, status: 'failed', reason: result.reason });
    log({ event: 'step-failed', step: step.id, reason: result.reason });
    return { kind: 'stop', reason: result.reason };
  }
  // A warning, or an optional step that failed: shown, logged, and setup goes on (DI-AC-04).
  board.set({ id: step.id, status: 'warning', reason: result.reason });
  log({ event: 'step-warning', step: step.id, reason: result.reason });
  return { kind: 'continue' };
}

const ALL_NOT_INSTALLED: OptionalComponentsReport = { searchModel: 'not-installed', captureBrowser: 'not-installed' };

/** One setup run. Resolves with the final progress it also sent to `onProgress`; never rejects. */
export async function runSetup(options: SetupRunOptions): Promise<SetupProgress> {
  const { log, onProgress } = options;
  const location = assessAppLocation(options.appBundlePath);
  if (location.kind === 'unstable') {
    log({ event: 'setup-refused', reason: location.problem });
    const refused: SetupProgress = { phase: 'refused', problem: location.problem };
    onProgress(refused);
    return refused;
  }
  log({ event: 'setup-started' });
  const board = new ProgressBoard(onProgress);
  const plan = options.createPlan(trackedInteraction(options.interaction, board));
  board.begin(plan.steps.map((step) => step.id));
  for (const step of plan.steps) {
    const outcome = await runOneStep(step, board, log);
    if (outcome.kind === 'stop') {
      log({ event: 'setup-failed', step: step.id, reason: outcome.reason });
      const failed: SetupProgress = { phase: 'failed', steps: board.steps, failedStep: step.id, reason: outcome.reason };
      onProgress(failed);
      return failed;
    }
  }
  const components = await guarded(() => plan.components(), ALL_NOT_INSTALLED);
  log({ event: 'setup-complete' });
  const complete: SetupProgress = { phase: 'complete', steps: board.steps, components };
  onProgress(complete);
  return complete;
}
