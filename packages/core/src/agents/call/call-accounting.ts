import { type ModelRoleName } from '@studio/shared/agents';
import { type ModelId, type RunId, type SessionId, type SessionOutcome, type StepKey } from '@studio/shared/run-format';
import { type CostLedgerService } from '../../costs';
import { type EgressLog } from '../../providers';
import { type ModelCallHooks, type OutgoingPromptMeasure } from '../adapters/claude-adapter';
import { type TraceTarget } from '../agents.errors';
import { type SessionStream } from '../sessions/session-stream';
import { toModelCallUsage, toModelCostSession, toUsageQuantity, totalTokens } from '../usage/model-usage.mapper';
import { estimateTokens, type CallGuard } from './call-guard';

export interface CallAccountingDeps {
  readonly role: ModelRoleName;
  readonly runId: RunId;
  readonly runDir: string;
  readonly sessionId: SessionId;
  readonly stepKey: StepKey;
  /** The model id recorded in cost.json: the provider model live, `mock-claude` on mocks. */
  readonly modelId: ModelId;
  readonly guard: CallGuard;
  readonly stream: SessionStream;
  readonly ledger: CostLedgerService;
  /** Present in live mode only: mock calls leave nothing on the machine's egress list. */
  readonly egress: EgressLog | null;
}

/**
 * The per-billed-call hooks of one agent session (topology sections 7 and 10):
 * - before: budget pre-check, then (live) the egress record, appended BEFORE the request is
 *   sent (SPEC 0002 rev 3); a failed append fails the call closed.
 * - after: usage through the A11 mapper, USD from the price table, the guard's token and USD
 *   bounds, a `usage` session line and one cost.json entry with its `callIndex`.
 * Writes run in the background of the model loop and are awaited by `settle()`; any failure is
 * also recorded on the guard, which stops the loop.
 */
export class CallAccounting implements ModelCallHooks {
  /** Outcome stamped on the next billed calls: `schema-retry` once feedback was sent. */
  outcome: SessionOutcome = 'ok';
  private callIndex = 0;
  private callStartedAt = new Date();
  private readonly pending: Promise<void>[] = [];
  private traceFailed: TraceTarget | null = null;

  constructor(private readonly deps: CallAccountingDeps) {}

  async beforeModelCall(measure: OutgoingPromptMeasure): Promise<void> {
    const { guard, egress } = this.deps;
    guard.assertCanCallModel(estimateTokens(measure.characters));
    this.callStartedAt = new Date();
    if (egress === null) return;
    try {
      await egress.record({
        provider: 'claude',
        what: 'prompt-text',
        stepKey: this.deps.stepKey,
        sessionId: this.deps.sessionId,
        at: this.callStartedAt,
        measure: { unit: 'characters', amount: measure.characters },
      });
      if (measure.fileParts > 0) {
        await egress.record({
          provider: 'claude',
          what: 'frames',
          stepKey: this.deps.stepKey,
          sessionId: this.deps.sessionId,
          at: this.callStartedAt,
          measure: { unit: 'bytes', amount: measure.fileBytes },
        });
      }
    } catch {
      // An unlisted call must not go out (fail closed); the C5 error is not quoted.
      throw guard.fail({ kind: 'trace-failed', target: 'egress' });
    }
  }

  afterModelCall(step: unknown): void {
    const { guard, ledger, stream } = this.deps;
    const usage = toModelCallUsage(step);
    if (usage === null) {
      guard.fail({ kind: 'trace-failed', target: 'usage' });
      return;
    }
    this.callIndex += 1;
    const callIndex = this.callIndex;
    let usd: number;
    try {
      usd = ledger.priceUsd(toUsageQuantity(this.deps.modelId, usage));
    } catch {
      guard.fail({ kind: 'configuration', reason: 'model-unpriced' });
      return;
    }
    guard.addModelCall(totalTokens(usage), usd);
    const session = toModelCostSession({
      sessionId: this.deps.sessionId,
      callIndex,
      stepKey: this.deps.stepKey,
      role: this.deps.role,
      modelId: this.deps.modelId,
      usage,
      usd,
      outcome: this.outcome,
      startedAt: this.callStartedAt,
      endedAt: new Date(),
    });
    this.track(stream.usage(callIndex, usage), 'session-stream');
    this.track(ledger.record({ runId: this.deps.runId, runDir: this.deps.runDir, session }).then(() => undefined), 'cost-ledger');
  }

  /** Waits for every usage line and ledger write; names the first that failed, if any. */
  async settle(): Promise<TraceTarget | null> {
    await Promise.all(this.pending);
    return this.traceFailed;
  }

  /**
   * The write runs while the model loop continues; its failure is recorded (never left as an
   * unhandled rejection) and stops the loop through the guard.
   */
  private track(write: Promise<void>, target: TraceTarget): void {
    this.pending.push(
      write.catch(() => {
        this.traceFailed ??= target;
        this.deps.guard.fail({ kind: 'trace-failed', target });
      }),
    );
  }
}
