import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CURATOR_INSTRUCTION_VERSION,
  CuratorCorrectionSchema,
  CuratorOutputSchema,
  CuratorTaskPacketSchema,
  curationBounds,
  type CurationCallOutcome,
  type CuratorCorrection,
  type CuratorTaskPacket,
} from '@studio/shared/curation';
import { curationLocationFromDirectory, type CurationLocation } from '@studio/shared/curation/files';
import { type CurationCostPort, type CuratorCallRequest, type CuratorCallResult, type CuratorPort } from '@studio/shared/ports';
import { newSessionId } from '@studio/shared/run-files';
import { type ModelId, type SessionId } from '@studio/shared/run-format';
import { ProviderModeService } from '../../providers';
import { RedactorService } from '../../redaction';
import { MOCK_MODEL_ID, curatorAgentDefinition } from '../agent-roster';
import { ProviderCallError } from '../agents.errors';
import { curatorPrompt, renderCuratorCorrection, renderCuratorPacket } from '../prompts/curator.prompt';
import { ZERO_USAGE, toUsageQuantity } from '../usage/model-usage.mapper';
import { CuratorCallError, describeCuratorFailure, type CuratorCallFailure } from './curator-call.error';
import { curatorCallOutcome, schemaIssuePaths, toCurationUsage, type CuratorCallAnswer, type CuratorSettlement } from './curator-call.mapper';
import { CuratorCallMeter } from './curator-call.meter';
import { CuratorCostRecorder, type RecordedSpend } from './curator-cost.recorder';
import { CuratorModelClient } from './curator-model.client';
import { CuratorSessionTrace } from './curator-session.trace';
import { CURATION_COST_PORT, CURATOR_PRICING, type CuratorPricing } from './curator.tokens';

interface CheckedRequest {
  readonly packet: CuratorTaskPacket;
  readonly correction: CuratorCorrection | null;
  readonly location: CurationLocation;
}

interface PreparedCall extends CheckedRequest {
  readonly live: boolean;
  readonly modelId: ModelId;
  readonly sessionId: SessionId;
  readonly trace: CuratorSessionTrace;
  readonly meter: CuratorCallMeter;
  readonly timeout: AbortSignal;
  readonly signal: AbortSignal;
  readonly deadlineMs: number;
}

/**
 * C6 `CuratorPort` on Mastra (SPEC 0005 section 5.5, topology 0004). Not part of `AgentsService`,
 * which is run-bound (L2). One `call` is exactly one model call: no tools, no internal schema
 * loop (the watcher owns the 2-call cap), at most 8,000 output tokens, and a 120 s timeout joined
 * to the caller's signal. Rate-limit retries stay inside that one call and its 120 s (B6). Every
 * call writes a redacted `session.jsonl` session whose `end` line is written in `finally`, and
 * every billed request is priced and recorded through `CurationCostPort`; a live request whose
 * usage never came back is recorded at its worst case (`CuratorCostRecorder`). Logs carry ids, counts,
 * amounts and outcome labels only, never packet, prompt or output text (K7). Mock by default
 * ($0, no key, no network); live only when the `claude` provider is switched to live.
 */
@Injectable()
export class CuratorAgentService implements CuratorPort, OnModuleInit {
  private readonly logger = new Logger(CuratorAgentService.name);
  private readonly costRecorder: CuratorCostRecorder;

  constructor(
    private readonly modes: ProviderModeService,
    private readonly redactor: RedactorService,
    private readonly client: CuratorModelClient,
    @Inject(CURATION_COST_PORT) costs: CurationCostPort,
    @Inject(CURATOR_PRICING) private readonly pricing: CuratorPricing,
  ) {
    this.costRecorder = new CuratorCostRecorder(costs, pricing);
  }

  /** Live mode fails the start, never the first curation: the key resolves and the model is priced. */
  onModuleInit(): void {
    if (!this.modes.isLive('claude')) return;
    this.modes.credentialFor('claude');
    this.pricing.priceUsd(toUsageQuantity(curatorAgentDefinition.defaultModelId, ZERO_USAGE));
  }

  async call(request: CuratorCallRequest): Promise<CuratorCallResult> {
    const checked = this.checkRequest(request);
    if (request.signal.aborted) throw new CuratorCallError({ kind: 'cancelled' });
    const live = this.modes.isLive('claude');
    const modelId = live ? curatorAgentDefinition.defaultModelId : MOCK_MODEL_ID;
    if (live) this.assertPriced(modelId);

    const sessionId = newSessionId();
    const meter = new CuratorCallMeter(modelId, this.pricing);
    const timeoutMs = Math.min(curationBounds.callTimeoutMs, checked.packet.budget.timeoutMs);
    const timeout = AbortSignal.timeout(timeoutMs);
    const startedAtMs = Date.now();
    const call: PreparedCall = {
      ...checked,
      live,
      modelId,
      sessionId,
      trace: new CuratorSessionTrace(this.redactor, checked.location, sessionId),
      meter,
      timeout,
      signal: AbortSignal.any([request.signal, timeout, meter.signal]),
      deadlineMs: startedAtMs + timeoutMs,
    };
    const { curationId, attempt } = checked.packet;
    this.logger.log({ event: 'curator.call-started', curationId, sessionId, attempt, modelId, instructionVersion: CURATOR_INSTRUCTION_VERSION, live });

    let outcome: CurationCallOutcome = 'failed';
    let failureLabel: string | null = null;
    let spend: RecordedSpend = { usd: 0, estimated: false, failure: null };
    try {
      const settlement = await this.settle(call);
      outcome = curatorCallOutcome(settlement, checked.correction);
      spend = await this.costRecorder.record(call, settlement, outcome);
      const failure = spend.failure ?? (settlement.kind === 'failure' ? settlement.failure : null);
      if (failure !== null || settlement.kind !== 'answer') {
        const reported: CuratorCallFailure = failure ?? { kind: 'internal' };
        failureLabel = describeCuratorFailure(reported);
        throw new CuratorCallError(reported, { sessionId, usd: spend.usd });
      }
      const { answer } = settlement;
      failureLabel = answer.status === 'ok' ? null : answer.status === 'failed' ? answer.reason : answer.status;
      return { ...answer, sessionId, usd: spend.usd };
    } finally {
      await this.endSession(call, outcome);
      const billed = meter.billedRequest;
      this.logger.log({
        event: 'curator.call-ended',
        curationId,
        sessionId,
        attempt,
        outcome,
        failure: failureLabel,
        inputTokens: billed?.usage.inputTokens ?? 0,
        outputTokens: billed?.usage.outputTokens ?? 0,
        usd: spend.usd,
        estimated: spend.estimated,
        durationMs: Date.now() - startedAtMs,
      });
    }
  }

  /** Strict parse of everything the watcher hands over; the folder must be this curation's. */
  private checkRequest(request: CuratorCallRequest): CheckedRequest {
    const packet = CuratorTaskPacketSchema.safeParse(request.packet);
    if (!packet.success) throw new CuratorCallError({ kind: 'invalid-request' });
    let correction: CuratorCorrection | null = null;
    if (request.correction !== undefined) {
      const parsed = CuratorCorrectionSchema.safeParse(request.correction);
      if (!parsed.success) throw new CuratorCallError({ kind: 'invalid-request' });
      correction = parsed.data;
    }
    // Attempt 2 is the one corrective or schema-feedback call, and only it carries a correction.
    if ((packet.data.attempt === curationBounds.maxCalls) !== (correction !== null)) {
      throw new CuratorCallError({ kind: 'invalid-request' });
    }
    let location: CurationLocation;
    try {
      location = curationLocationFromDirectory(request.curationDir);
    } catch {
      throw new CuratorCallError({ kind: 'invalid-request' });
    }
    if (location.curationId !== packet.data.curationId) throw new CuratorCallError({ kind: 'invalid-request' });
    return { packet: packet.data, correction, location };
  }

  private assertPriced(modelId: ModelId): void {
    try {
      this.pricing.priceUsd(toUsageQuantity(modelId, ZERO_USAGE));
    } catch {
      throw new CuratorCallError({ kind: 'configuration', reason: 'model-unpriced' });
    }
  }

  /** The exchange as a value: an answer for the port's result union, or a failure to throw. */
  private async settle(call: PreparedCall): Promise<CuratorSettlement> {
    try {
      return { kind: 'answer', answer: await this.exchange(call) };
    } catch (error) {
      return this.classify(error, call);
    }
  }

  private async exchange(call: PreparedCall): Promise<CuratorCallAnswer> {
    const { packet, correction } = call;
    await call.trace.start({ curationId: packet.curationId, attempt: packet.attempt, modelId: call.modelId });
    const body = await this.redactOrFail(renderCuratorPacket(packet));
    const correctionText = correction === null ? null : await this.redactOrFail(renderCuratorCorrection(correction));
    await call.trace.prompt(correctionText === null ? body : `${body}\n\n${correctionText}`);

    const raw = await this.client.generate({
      packet,
      live: call.live,
      modelId: call.modelId,
      instructions: curatorPrompt.system,
      correction: correctionText,
      body,
      maxOutputTokens: Math.min(curationBounds.maxOutputTokens, packet.budget.maxTokens),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      hooks: call.meter,
    });
    // A request whose usage or price could not be read was still billed: fail closed.
    if (call.meter.failure !== null) throw new CuratorCallError(call.meter.failure);
    if (call.meter.billedRequest === null) throw new CuratorCallError({ kind: 'trace-failed', target: 'usage' });

    const parsed = CuratorOutputSchema.safeParse(raw);
    if (!parsed.success) return { status: 'schema-invalid', issues: schemaIssuePaths(parsed.error) };
    await call.trace.output(parsed.data);
    return { status: 'ok', output: parsed.data };
  }

  /**
   * Which signal fired first decides the meaning: the 120 s call timeout is a `call-timeout`
   * result; the meter's stop is its recorded failure; anything else is the caller's signal
   * (curation timeout or watcher stop), which the watcher names itself.
   */
  private classify(error: unknown, call: PreparedCall): CuratorSettlement {
    if (call.signal.aborted) {
      const reason: unknown = call.signal.reason;
      if (reason === call.timeout.reason) return { kind: 'answer', answer: { status: 'failed', reason: 'call-timeout' } };
      if (reason === call.meter.signal.reason) return { kind: 'failure', failure: call.meter.failure ?? { kind: 'internal' } };
      return { kind: 'failure', failure: { kind: 'cancelled' } };
    }
    if (call.meter.failure !== null) return { kind: 'failure', failure: call.meter.failure };
    if (error instanceof CuratorCallError) return { kind: 'failure', failure: error.failure };
    if (error instanceof ProviderCallError) {
      const reason = error.failure.class === 'rate-limit' ? 'rate-limited' : 'provider-error';
      return { kind: 'answer', answer: { status: 'failed', reason } };
    }
    this.logger.error({ event: 'curator.unexpected-error', curationId: call.packet.curationId, errorName: error instanceof Error ? error.name : 'unknown' });
    return { kind: 'failure', failure: { kind: 'internal' } };
  }

  /** Topology 0004 section 10: the end line with `instructionVersion`, failed calls included. */
  private async endSession(call: PreparedCall, outcome: CurationCallOutcome): Promise<void> {
    const billed = call.meter.billedRequest;
    try {
      await call.trace.end({ outcome, usage: billed === null ? null : toCurationUsage(billed.usage) });
    } catch {
      // The call's own result (output or typed failure) stands; the missing end line is reported here.
      this.logger.warn({ event: 'curator.session-end-unwritten', curationId: call.packet.curationId, sessionId: call.sessionId });
    }
  }

  private async redactOrFail(text: string): Promise<string> {
    const result = await this.redactor.redactText(text);
    if (result.status === 'failed') throw new CuratorCallError({ kind: 'redaction-failed' });
    return result.value;
  }
}
