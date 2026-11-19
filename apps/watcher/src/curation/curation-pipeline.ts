import { Inject, Injectable, Logger } from '@nestjs/common';
import { CuratorCallError, OutputScanner, describeCuratorFailure, worstCaseInputChars } from '@studio/core/agents';
import {
  CurationEvidenceCollector,
  CurationGroundCheckLookups,
  buildCuratorPacket,
  groundCheckCorrection,
  nextCurationAction,
  runGroundCheck,
  schemaCorrection,
  type CollectedEvidence,
  type CurationCallSummary,
  type CuratorProposalOutput,
  type GroundCheckResult,
  type NextCurationAction,
} from '@studio/core/curation';
import { RedactorService } from '@studio/core/redaction';
import {
  CURATION_FORMAT_VERSION,
  CURATOR_INSTRUCTION_VERSION,
  CURATOR_ROLE,
  curationBounds,
  type CurationCallOutcome,
  type CurationRefusedReason,
  type CuratorCorrection,
  type CuratorTaskPacket,
} from '@studio/shared/curation';
import { type CuratorCallResult, type CuratorPort } from '@studio/shared/ports';
import { JsonValueSchema, type ModelId, type SessionId } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';
import { type ClaimedCuration } from './claimed-curation';
import { callOutcomeOf, curatorScanOf, failed, passedChecksOf, refused, type CurationEnding } from './curation-file.mapper';
import { type CurationSignals } from './curation-signals';
import { CurationSpendGuard } from './curation-spend.guard';
import { CURATION_CLOCK, CURATOR } from './curation.tokens';

type Collected = Extract<CollectedEvidence, { status: 'collected' }>;
type PassedCheck = Extract<GroundCheckResult, { passed: true }>;

/** What one call left for the routing function and the final write. */
type CallTurn =
  | { kind: 'ended'; ending: CurationEnding }
  | {
      kind: 'routed';
      summary: CurationCallSummary;
      /** Schema paths of a `schema-invalid` answer, for the schema correction; never model text. */
      issues: readonly string[];
      proposal: { output: CuratorProposalOutput; check: PassedCheck } | null;
      noChangeReason: string | null;
    };

interface CurationPlan {
  claimed: ClaimedCuration;
  signals: CurationSignals;
  evidence: Collected;
  modelId: ModelId;
}

/** Only these two results can lead to a second call; the gate is not consulted for the others. */
function mayAskSecondCall(summary: CurationCallSummary): boolean {
  return summary.result === 'schema-invalid' || summary.result === 'proposal-failed';
}

/**
 * The grounded pipeline of one claimed curation (SPEC 0005 section 5.2): collect, screen, call,
 * check, and the proposal write. It returns how the curation ends; the step writes that ending.
 * At most `curationBounds.maxCalls` (2) Curator calls: the loop is bounded by it, routing is
 * `nextCurationAction`'s alone, and the packet schema refuses a third attempt (C5-AC-04). Every
 * call is preceded by the month gate and the $1.00 worst-case bound (C5-AC-07, C5-AC-08).
 * Nothing here logs or emits body, note, focus, reason, summary or diff text (K7).
 */
@Injectable()
export class CurationPipeline {
  private readonly logger = new Logger(CurationPipeline.name);

  constructor(
    @Inject(CurationEvidenceCollector) private readonly collector: CurationEvidenceCollector,
    @Inject(CurationGroundCheckLookups) private readonly lookups: CurationGroundCheckLookups,
    @Inject(CurationSpendGuard) private readonly spend: CurationSpendGuard,
    @Inject(OutputScanner) private readonly outputScanner: OutputScanner,
    @Inject(RedactorService) private readonly redactor: RedactorService,
    @Inject(CURATOR) private readonly curator: CuratorPort,
    @Inject(CURATION_CLOCK) private readonly clock: Clock,
  ) {}

  async run(claimed: ClaimedCuration, signals: CurationSignals): Promise<CurationEnding> {
    const evidence = await signals.guard(this.collector.collect(claimed.file));
    if (evidence.status === 'refused') return refused(evidence.reason);
    await claimed.event({ type: 'curation.collected', counts: evidence.counts });

    const plan: CurationPlan = { claimed, signals, evidence, modelId: this.spend.curatorModelId() };
    const first = this.packetFor(plan, 1);
    const refusal = await signals.guard(this.screen(plan, first));
    if (refusal !== null) return refused(refusal);
    return this.callUpToTwice(plan, first);
  }

  /** Inputs identical on both calls; only `attempt` and `budget` differ (L3, Q3). */
  private packetFor(plan: CurationPlan, attempt: number): CuratorTaskPacket {
    return buildCuratorPacket({ curationId: plan.claimed.curationId, attempt, inputs: plan.evidence.inputs, spentUsd: plan.claimed.spentUsd });
  }

  /** Step `screen`: redactor over the packet, month gate, worst case of call 1; $0 spent on a refusal. */
  private async screen(plan: CurationPlan, packet: CuratorTaskPacket): Promise<CurationRefusedReason | null> {
    const redaction = await this.redactor.redactJson(JsonValueSchema.parse(packet));
    if (redaction.status === 'failed') return 'redactor-unavailable';
    const { secrets, patterns, biometric } = redaction.counts;
    if (secrets + patterns + biometric > 0) return 'packet-secret-found';
    const month = await this.spend.monthGate(plan.claimed.spentUsd);
    if (month.decision === 'refuse') return month.reason;
    const budget = await this.spend.callBudget({
      spentUsd: plan.claimed.spentUsd,
      modelId: plan.modelId,
      inputChars: worstCaseInputChars(packet, false),
    });
    return budget.decision === 'refuse' ? budget.reason : null;
  }

  private async callUpToTwice(plan: CurationPlan, first: CuratorTaskPacket): Promise<CurationEnding> {
    let packet = first;
    let correction: CuratorCorrection | null = null;
    for (let call = 1; call <= curationBounds.maxCalls; call += 1) {
      const turn = await this.callOnce(plan, packet, correction);
      if (turn.kind === 'ended') return turn.ending;
      const secondCallFits =
        packet.attempt < curationBounds.maxCalls && mayAskSecondCall(turn.summary)
          ? await plan.signals.guard(this.spend.secondCallFits({ spentUsd: plan.claimed.spentUsd, modelId: plan.modelId, packet: first }))
          : false;
      const action = nextCurationAction({ attempt: packet.attempt, summary: turn.summary, secondCallFits });
      if (action.action === 'end') return this.finish(plan, action, turn, packet.attempt);
      correction = action.kind === 'schema' ? schemaCorrection(turn.issues) : groundCheckCorrection(action.failedChecks);
      packet = this.packetFor(plan, action.attempt);
    }
    // Unreachable: `nextCurationAction` ends every attempt 2. Kept so the cap never depends on it alone.
    return failed('internal-error');
  }

  private async callOnce(plan: CurationPlan, packet: CuratorTaskPacket, correction: CuratorCorrection | null): Promise<CallTurn> {
    const { claimed, signals } = plan;
    const startedAt = this.clock.now();
    let result: CuratorCallResult;
    try {
      // Only the 300 s curation signal joined to the daemon stop; the agent adds its own 120 s.
      result = await this.curator.call({
        packet,
        ...(correction === null ? {} : { correction }),
        curationDir: claimed.directory,
        signal: signals.signal,
      });
    } catch (error) {
      if (!(error instanceof CuratorCallError)) throw error;
      return this.callFailed(plan, { error, attempt: packet.attempt, startedAt });
    }
    await claimed.recordCall({ sessionId: result.sessionId, usd: result.usd, modelId: plan.modelId });
    const output = result.status === 'ok' ? result.output : null;
    await this.callEvents(plan, { sessionId: result.sessionId, attempt: packet.attempt, startedAt, usd: result.usd, outcome: callOutcomeOf(output, correction) });

    const routed = { kind: 'routed' as const, issues: [], proposal: null, noChangeReason: null };
    if (result.status === 'failed') return { ...routed, summary: { result: 'failed', reason: result.reason } };
    if (result.status === 'schema-invalid') return { ...routed, summary: { result: 'schema-invalid' }, issues: result.issues };
    const answer = result.output;
    if (answer.decision === 'no-change') return { ...routed, summary: { result: 'no-change' }, noChangeReason: answer.reason };
    return this.check(plan, answer, packet);
  }

  /**
   * A call that rejected instead of returning a result. Its spend still counts. A cancelled call is
   * the curation signal firing (`watcher-stopped` or `curation-timeout`); any other failure kind is
   * a wiring or trace fault and ends `failed` / `internal-error`.
   */
  private async callFailed(plan: CurationPlan, failure: { error: CuratorCallError; attempt: number; startedAt: Date }): Promise<CallTurn> {
    const { claimed, signals } = plan;
    const { sessionId, usd } = failure.error.context;
    if (sessionId !== null || usd > 0) await claimed.recordCall({ sessionId, usd, modelId: plan.modelId });
    if (sessionId !== null) await this.callEvents(plan, { sessionId, attempt: failure.attempt, startedAt: failure.startedAt, usd, outcome: 'failed' });
    if (failure.error.failure.kind === 'cancelled') signals.throwIfAborted();
    this.logger.warn({ event: 'curation.call-failed', curationId: claimed.curationId, attempt: failure.attempt, failure: describeCuratorFailure(failure.error.failure) });
    return { kind: 'ended', ending: failed('internal-error') };
  }

  /**
   * `curation.call.started` and `curation.call.ended`. The session id is minted inside the agent, so
   * both are appended once the call returns; `started` carries the instant the call began.
   */
  private async callEvents(
    plan: CurationPlan,
    call: { sessionId: SessionId; attempt: number; startedAt: Date; usd: number; outcome: CurationCallOutcome },
  ): Promise<void> {
    const { claimed } = plan;
    const { sessionId, attempt } = call;
    await claimed.event({ type: 'curation.call.started', sessionId, attempt, role: CURATOR_ROLE, modelId: plan.modelId, instructionVersion: CURATOR_INSTRUCTION_VERSION });
    await claimed.event({
      type: 'curation.call.ended',
      sessionId,
      attempt,
      outcome: call.outcome,
      tokens: await claimed.usageOf(sessionId),
      usd: call.usd,
      durationMs: Math.max(0, this.clock.now().getTime() - call.startedAt.getTime()),
    });
  }

  /** Step `check` (SPEC 0005 section 5.4): the event lists the ids that ran and passed or failed, ids only. */
  private async check(plan: CurationPlan, output: CuratorProposalOutput, packet: CuratorTaskPacket): Promise<CallTurn> {
    const { claimed, signals, evidence } = plan;
    const { selected } = evidence;
    const check = await signals.guard(
      runGroundCheck(
        {
          curationId: claimed.curationId,
          subjectBody: selected.body,
          subjectRecipe: selected.target.kind === 'recipe' ? selected.target.view.recipe : null,
          evidenceKey: selected.evidenceKey,
          packetRunIds: packet.inputs.outcomes.runs.map((run) => run.runId),
          output,
        },
        { lookups: this.lookups, scanOutput: async (texts) => curatorScanOf(await this.outputScanner.scan([...texts])) },
      ),
    );
    const failedChecks = check.passed ? [] : check.failedChecks;
    const passed = passedChecksOf({ failedChecks, skippedChecks: check.passed ? [] : check.skippedChecks });
    await claimed.event({ type: 'curation.check', attempt: packet.attempt, passed, failed: failedChecks });
    const routed = { kind: 'routed' as const, issues: [], noChangeReason: null };
    if (!check.passed) return { ...routed, summary: { result: 'proposal-failed', failedChecks }, proposal: null };
    return { ...routed, summary: { result: 'proposal-passed' }, proposal: { output, check } };
  }

  private async finish(
    plan: CurationPlan,
    action: Extract<NextCurationAction, { action: 'end' }>,
    turn: Extract<CallTurn, { kind: 'routed' }>,
    attempt: number,
  ): Promise<CurationEnding> {
    switch (action.status) {
      case 'proposed':
        return this.propose(plan, turn, attempt);
      case 'no-change':
        return { status: 'no-change', noChangeReason: await this.redactedNoChangeReason(turn.noChangeReason ?? '') };
      case 'no-proposal':
        return { status: 'no-proposal', reasonId: action.reasonId, failedChecks: action.failedChecks };
      case 'failed':
        return failed(action.reasonId);
    }
  }

  /** Step `write`: `proposal.json` once, before the step writes `proposed` (C5-AC-01). */
  private async propose(plan: CurationPlan, turn: Extract<CallTurn, { kind: 'routed' }>, attempt: number): Promise<CurationEnding> {
    if (turn.proposal === null) return failed('internal-error');
    // The 300 s bound runs from the claim to the final write: a late proposal is not written.
    plan.signals.throwIfAborted();
    const { output, check } = turn.proposal;
    const { claimed, evidence } = plan;
    await claimed.writeProposal({
      format: CURATION_FORMAT_VERSION,
      curationId: claimed.curationId,
      subject: claimed.file.subject,
      baseBodySha256: evidence.baseBodySha256,
      newBody: output.newBody,
      diff: check.diff,
      diffStats: check.diffStats,
      changeSummary: output.changeSummary,
      reason: output.reason,
      evidenceRunIds: output.evidenceRunIds,
      expectedEffect: output.expectedEffect,
      suggestComparison: output.suggestComparison,
      checks: check.checks,
      attempt,
      modelId: plan.modelId,
      instructionVersion: CURATOR_INSTRUCTION_VERSION,
      createdAt: this.clock.now().toISOString(),
    });
    return { status: 'proposed' };
  }

  /**
   * The Curator's `no-change` reason is shown to the owner from `curation.json`; it passes the
   * redactor first like every model text the watcher stores (a failed redaction stores the
   * placeholder, never the raw text).
   */
  private async redactedNoChangeReason(reason: string): Promise<string> {
    const redacted = await this.redactor.redactTextOrPlaceholder(reason);
    return redacted.slice(0, 1000);
  }
}
