import { appendRunEvent, writeRunFile } from '@studio/shared/run-files';
import {
  formatStepKey,
  type Activity,
  type CostFile,
  type EventLevel,
  type RunEvent,
  type RunFile,
  type RunState,
  type StageEstimate,
  type StageId,
  type StageOutput,
  type StageRecord,
  type StepKey,
  type StepName,
  type StepRecord,
  type StepStatus,
} from '@studio/shared/run-format';
import { type Clock } from './clock';
import { costTotals, stepCostUsd } from './cost-totals';
import { StageNotFoundError } from './engine.errors';
import { NowPublisher } from './now-publisher';
import { ownerTexts, stepStatusText } from './owner-texts';
import { RunBudget, type BudgetBaseline } from './run-budget';
import { nextPendingCursor } from './run-mutations';
import { type ControlRequestKind } from './seams';
import { clip, textLimits } from './text';
import { assertRunTransition, assertStepTransition } from './transitions';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before the engine stamps time, run id and correlation id on it. */
export type RunEventInput = DistributiveOmit<RunEvent, 'atMs' | 'runId' | 'correlationId'>;

export interface StepPosition {
  stageNumber: number;
  stageId: StageId;
  step: StepName;
  attempt: number;
}

export type StepEndStatus = Extract<StepStatus, 'ok' | 'warning' | 'failed' | 'pending'>;

export interface ActiveRunOptions {
  runDir: string;
  run: RunFile;
  pid: number;
  clock: Clock;
  /** Spent attempts and recoveries that do not count again (owner resume); empty otherwise. */
  baseline: BudgetBaseline;
}

const stepEndLevel: Readonly<Record<StepEndStatus, EventLevel>> = {
  ok: 'ok',
  warning: 'warning',
  failed: 'error',
  pending: 'warning',
};

/**
 * One watcher execution of one run: the in-memory run.json the engine mutates, and every write
 * that persists it. All writes go through `@studio/shared/run-files` (C5); this class is the
 * single writer of run.json, events.jsonl and now.json while the watcher pid lives (ADR 0003).
 */
export class ActiveRun {
  readonly abortController = new AbortController();
  readonly runDir: string;
  readonly budget: RunBudget;
  private readonly run: RunFile;
  private readonly now: NowPublisher;
  private readonly acknowledgedRequests = new Set<ControlRequestKind>();
  private readonly executionStartedMs: number;
  private readonly pid: number;
  private readonly clock: Clock;

  constructor(options: ActiveRunOptions) {
    this.runDir = options.runDir;
    this.run = structuredClone(options.run);
    this.pid = options.pid;
    this.clock = options.clock;
    this.budget = new RunBudget(options.baseline);
    this.executionStartedMs = options.clock.now().getTime();
    this.now = new NowPublisher({
      runDir: options.runDir,
      runId: options.run.runId,
      pid: options.pid,
      clock: options.clock,
      cursor: () => this.run.cursor,
    });
  }

  get snapshot(): Readonly<RunFile> {
    return this.run;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  stage(stageNumber: number): StageRecord {
    const stage = this.run.stages[stageNumber - 1];
    if (stage === undefined) throw new StageNotFoundError(stageNumber);
    return stage;
  }

  stepRecord(stageNumber: number, step: StepName): StepRecord {
    const record = this.stage(stageNumber).steps.find((candidate) => candidate.step === step);
    if (record === undefined) throw new StageNotFoundError(stageNumber);
    return record;
  }

  /** Claims the run for this pid (`pending` or a held status -> `running`) and opens `lastExecution` (RUN-FORMAT 14). */
  async start(): Promise<void> {
    const startedAt = this.clock.now().toISOString();
    this.run.totals = { ...this.run.totals, executions: this.run.totals.executions + 1 };
    this.run.lastExecution = { pid: this.pid, startedAt, endedAt: null, outcome: null };
    await this.setState({ status: 'running', since: startedAt, pid: this.pid });
    await this.emit({ type: 'log', level: 'info', text: ownerTexts.runStarted(this.pid), stepKey: null });
  }

  /** Closes `lastExecution` with the status this execution ended in. */
  async finish(): Promise<void> {
    const now = this.clock.now();
    const elapsedMs = Math.max(0, now.getTime() - this.executionStartedMs);
    this.run.totals = { ...this.run.totals, durationMs: this.run.totals.durationMs + elapsedMs };
    if (this.run.lastExecution !== null) {
      this.run.lastExecution = { ...this.run.lastExecution, endedAt: now.toISOString(), outcome: this.run.state.status };
    }
    await this.flushNow();
    await this.persist();
  }

  async setState(next: RunState, stepKey: StepKey | null = null): Promise<void> {
    const from = this.run.state.status;
    assertRunTransition(from, next.status);
    this.run.state = next;
    await this.persist();
    await this.emit({ type: 'run.status', level: 'info', text: ownerTexts.runStatus(from, next.status), stepKey, from, to: next.status });
  }

  /** A change from `run-mutations`, persisted at once; the caller emits the matching events. */
  async apply<T>(change: (run: RunFile) => T): Promise<T> {
    const result = change(this.run);
    await this.persist();
    return result;
  }

  /** Records a control.json request the first time this execution acts on it (RUN-FORMAT 11). */
  async acknowledgeControl(request: ControlRequestKind): Promise<void> {
    if (this.acknowledgedRequests.has(request)) return;
    this.acknowledgedRequests.add(request);
    await this.emit({ type: 'control.request', level: 'info', text: ownerTexts.controlRequest(request), stepKey: null, request });
  }

  /** A stage the recipe switched off: every step `skipped`, outcome `disabled-by-recipe`. */
  async skipStage(stageNumber: number): Promise<void> {
    const stage = this.stage(stageNumber);
    for (const record of stage.steps) {
      assertStepTransition(record.step, record.status, 'skipped');
      record.status = 'skipped';
    }
    stage.outcome = { status: 'skipped', reason: 'disabled-by-recipe' };
    await this.persist();
    await this.emit({ type: 'log', level: 'info', text: ownerTexts.stageSkipped(stageNumber, stage.stageId), stepKey: null });
  }

  async beginStep(position: StepPosition): Promise<StepKey> {
    const record = this.stepRecord(position.stageNumber, position.step);
    assertStepTransition(position.step, record.status, 'running');
    const now = this.clock.now();
    record.status = 'running';
    record.attempts = position.attempt;
    record.startedAt = now.toISOString();
    record.endedAt = null;
    this.run.cursor = { ...position };
    this.now.markStepStart(now.getTime());
    const stepKey = formatStepKey(position);
    await this.persist();
    await this.emit({
      type: 'step.status',
      level: 'step',
      text: stepStatusText(position.stageNumber, position.stageId, position.step, 'running'),
      stepKey,
      status: 'running',
    });
    await this.now.publish();
    return stepKey;
  }

  async endStep(position: StepPosition, status: StepEndStatus, detail: string): Promise<void> {
    const stage = this.stage(position.stageNumber);
    const record = this.stepRecord(position.stageNumber, position.step);
    assertStepTransition(position.step, record.status, status);
    const now = this.clock.now();
    const startedMs = record.startedAt === null ? now.getTime() : Date.parse(record.startedAt);
    record.status = status;
    record.endedAt = now.toISOString();
    record.durationMs += Math.max(0, now.getTime() - startedMs);
    record.detail = clip(detail, textLimits.stepDetail);
    stage.durationMs = stage.steps.reduce((total, step) => total + step.durationMs, 0);
    if (status === 'failed') this.run.totals = { ...this.run.totals, failures: this.run.totals.failures + 1 };
    await this.persist();
    await this.emit({
      type: 'step.status',
      level: stepEndLevel[status],
      text: clip(`${stepStatusText(position.stageNumber, position.stageId, position.step, status)}. ${detail}`, textLimits.eventText),
      stepKey: formatStepKey(position),
      status,
    });
    await this.now.publish();
  }

  setStageEstimate(stageNumber: number, estimate: StageEstimate): void {
    this.stage(stageNumber).estimate = estimate;
  }

  setStageOutputs(stageNumber: number, outputs: readonly StageOutput[]): void {
    this.stage(stageNumber).outputs = [...outputs];
  }

  addChecksRun(count: number): void {
    this.run.totals = { ...this.run.totals, checksRun: this.run.totals.checksRun + count };
  }

  /** Copies cost.json into totals and into the stage and step cost fields. */
  applyCost(cost: CostFile): void {
    this.run.totals = { ...this.run.totals, ...costTotals(cost) };
    for (const stage of this.run.stages) {
      for (const record of stage.steps) record.costUsd = stepCostUsd(cost, stage.stageId, record.step);
      stage.costUsd = stage.steps.reduce((total, record) => total + record.costUsd, 0);
    }
  }

  /** Called after the `record` step is `ok`: the stage is delivered and the cursor moves on. */
  async deliverStage(stageNumber: number, summary: string): Promise<void> {
    const stage = this.stage(stageNumber);
    stage.outcome = {
      status: 'delivered',
      deliveredAt: this.clock.now().toISOString(),
      summary: clip(summary, textLimits.stageSummary),
    };
    this.run.totals = {
      ...this.run.totals,
      stagesDelivered: this.run.stages.filter((candidate) => candidate.outcome.status === 'delivered').length,
    };
    this.run.cursor = nextPendingCursor(this.run, stageNumber);
    await this.persist();
    await this.emit({ type: 'log', level: 'ok', text: ownerTexts.stageDelivered(stageNumber, stage.stageId), stepKey: null });
  }

  setPlan(plan: RunFile['plan']): void {
    this.run.plan = plan;
  }

  /** Executor activity for now.json; the write is queued and any failure surfaces at `flushNow`. */
  report(activity: Omit<Activity, 'atMs'>): void {
    this.now.report(activity);
  }

  /** now.json `parallel`, e.g. the next stage's brief drafted during `execute` (PRD 7.2 step 4). */
  setParallel(text: string | null): void {
    this.now.setParallel(text);
  }

  /** now.json `notice` for the owner, e.g. a pause requested while a step runs. */
  setNotice(text: string | null): void {
    this.now.setNotice(text);
  }

  async flushNow(): Promise<void> {
    await this.now.flush();
  }

  async emit(input: RunEventInput): Promise<void> {
    const event: RunEvent = {
      ...input,
      text: clip(input.text, textLimits.eventText),
      atMs: this.clock.now().getTime(),
      runId: this.run.runId,
      correlationId: this.run.correlationId,
    };
    await appendRunEvent(this.runDir, event);
  }

  async persist(): Promise<void> {
    this.run.updatedAt = this.clock.now().toISOString();
    await writeRunFile(this.runDir, this.run);
  }
}
