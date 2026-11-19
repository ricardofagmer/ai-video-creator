import { Logger } from '@nestjs/common';
import {
  CURATOR_ROLE,
  CurationCostSessionSchema,
  curationBounds,
  type CurationCallOutcome,
  type CurationUsage,
  type CuratorCorrection,
  type CuratorTaskPacket,
} from '@studio/shared/curation';
import { curationDirectory, type CurationLocation } from '@studio/shared/curation/files';
import { type CurationCostPort } from '@studio/shared/ports';
import { type ModelId, type SessionId } from '@studio/shared/run-format';
import { toUsageQuantity } from '../usage/model-usage.mapper';
import { type CuratorCallFailure } from './curator-call.error';
import { toCurationUsage, type CuratorSettlement } from './curator-call.mapper';
import { type CuratorCallMeter } from './curator-call.meter';
import { worstCaseInputChars } from './curator-worst-case';
import { type CuratorPricing } from './curator.tokens';

/** The one billed request of a Curator session is call 1 of that session (SPEC 0005 B6). */
const BILLED_CALL_INDEX = 1;

/**
 * B7's safe over-estimate of input tokens per prompt character, the rule `CurationCostPort.worstCaseUsd`
 * prices with. The agents folder may not import the core `costs/` folder, so the figure is repeated here.
 */
const WORST_CASE_CHARS_PER_TOKEN = 3;

/** The facts of one Curator call the cost entry is built from. */
export interface CuratorCostCall {
  readonly packet: CuratorTaskPacket;
  readonly correction: CuratorCorrection | null;
  readonly location: CurationLocation;
  readonly live: boolean;
  readonly modelId: ModelId;
  readonly sessionId: SessionId;
  readonly meter: CuratorCallMeter;
}

/** What `cost.json` received for one call: the spend to report, and a failure when the write failed. */
export interface RecordedSpend {
  readonly usd: number;
  readonly estimated: boolean;
  readonly failure: CuratorCallFailure | null;
}

type CostEntry = CurationUsage & { usd: number; outcome: CurationCallOutcome; startedAt: Date; endedAt: Date };

/**
 * One `cost.json` entry per Curator call that reached the provider (C5-AC-16), mock calls at $0
 * included. A live request that was sent but returned no usage (call timeout, curation timeout,
 * stop, unreadable usage) may still have been billed, so it is recorded at the worst case the
 * watcher priced before the call (`worstCaseInputChars` plus the output cap, uncached) with outcome
 * `failed`; month-to-date then never undercounts. Such an entry is told apart by its session `end`
 * line, which carries `usage: null`. A rate-limited call is not estimated: a 429 is refused before
 * the provider processes the request (B6). Logs carry ids and amounts only (K7).
 */
export class CuratorCostRecorder {
  private readonly logger = new Logger(CuratorCostRecorder.name);

  constructor(
    private readonly costs: CurationCostPort,
    private readonly pricing: CuratorPricing,
  ) {}

  async record(call: CuratorCostCall, settlement: CuratorSettlement, outcome: CurationCallOutcome): Promise<RecordedSpend> {
    const billed = call.meter.billedRequest;
    if (billed !== null) {
      const entry: CostEntry = { ...toCurationUsage(billed.usage), usd: billed.usd, outcome, startedAt: billed.startedAt, endedAt: billed.endedAt };
      return { usd: billed.usd, estimated: false, failure: await this.write(call, entry) };
    }
    const sentAt = call.meter.unbilledRequestStartedAt;
    const rateLimited = settlement.kind === 'answer' && settlement.answer.status === 'failed' && settlement.answer.reason === 'rate-limited';
    if (!call.live || sentAt === null || rateLimited) return { usd: 0, estimated: false, failure: null };
    return this.recordEstimate(call, sentAt);
  }

  private async recordEstimate(call: CuratorCostCall, sentAt: Date): Promise<RecordedSpend> {
    const usage: CurationUsage = {
      inputTokens: Math.ceil(worstCaseInputChars(call.packet, call.correction !== null) / WORST_CASE_CHARS_PER_TOKEN),
      outputTokens: curationBounds.maxOutputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    let usd: number;
    try {
      usd = this.pricing.priceUsd(toUsageQuantity(call.modelId, usage));
    } catch {
      // The model was priced before the call (`assertPriced`); failing here fails closed as unrecorded.
      this.logger.error({ event: 'curator.cost-unrecorded', curationId: call.packet.curationId, sessionId: call.sessionId, estimated: true });
      return { usd: 0, estimated: true, failure: { kind: 'trace-failed', target: 'cost-ledger' } };
    }
    this.logger.warn({ event: 'curator.cost-estimated', curationId: call.packet.curationId, sessionId: call.sessionId, usd });
    const failure = await this.write(call, { ...usage, usd, outcome: 'failed', startedAt: sentAt, endedAt: new Date() });
    return { usd, estimated: true, failure };
  }

  /** Appends one session to `cost.json`; null when recorded. */
  private async write(call: CuratorCostCall, entry: CostEntry): Promise<CuratorCallFailure | null> {
    try {
      const session = CurationCostSessionSchema.parse({
        sessionId: call.sessionId,
        callIndex: BILLED_CALL_INDEX,
        attempt: call.packet.attempt,
        kind: 'model',
        role: CURATOR_ROLE,
        provider: 'claude',
        modelId: call.modelId,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cacheReadTokens: entry.cacheReadTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
        usd: entry.usd,
        outcome: entry.outcome,
        startedAt: entry.startedAt.toISOString(),
        endedAt: entry.endedAt.toISOString(),
      });
      await this.costs.record({ curationId: call.packet.curationId, curationDir: curationDirectory(call.location), session });
      return null;
    } catch {
      // The spend still travels on the thrown error (`usd`), so the caller can count it.
      this.logger.error({ event: 'curator.cost-unrecorded', curationId: call.packet.curationId, sessionId: call.sessionId, usd: entry.usd });
      return { kind: 'trace-failed', target: 'cost-ledger' };
    }
  }
}
