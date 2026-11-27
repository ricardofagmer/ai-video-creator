import { Injectable, Logger } from '@nestjs/common';
import { COST_SUM_TOLERANCE_USD } from '@studio/shared/run-format';
import { CurationCostSessionSchema, CurationIdSchema } from '@studio/shared/curation';
import { curationLocationFromDirectory, readCurationCost, writeCurationCost } from '@studio/shared/curation/files';
import {
  type CurationCostPort,
  type CurationCostRecordRequest,
  type CurationWorstCaseRequest,
  type UsageQuantity,
} from '@studio/shared/ports';
import { ProviderModeService } from '../providers/provider-mode.service';
import { KeyedMutex } from '../runtime/keyed-mutex';
import { CostFileCurationMismatchError, CostSessionPriceMismatchError } from './costs.errors';
import { appendCurationCostSession } from './curation-cost-file';
import { curationCostSessionKey, usageOfCurationCostSession } from './curation-cost.mapper';
import { PRICE_TABLE } from './price-table';
import { priceUsage } from './pricing';

/** B7: a safe over-estimate of input tokens without a tokenizer dependency. */
export const WORST_CASE_CHARS_PER_TOKEN = 3;

function assertCount(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${field} must be a finite, non-negative number`);
}

/**
 * C6 `CurationCostPort` (SPEC 0005 section 5.8, B1), bound by the watcher. It writes only
 * `curations/<id>/cost.json` through the shared helper and never SQLite (ADR 0003); the api and the
 * CLI index the file with `IndexCurationCostCommand`. Mock mode costs nothing; live usage is priced
 * from the same versioned price table as run sessions, so a curation and a run read one total.
 */
@Injectable()
export class CurationCostLedger implements CurationCostPort {
  readonly priceTableVersion = PRICE_TABLE.version;
  private readonly logger = new Logger(CurationCostLedger.name);
  /** cost.json is read-modify-written; two sessions of one curation must not interleave. */
  private readonly curationFiles = new KeyedMutex();

  constructor(private readonly modes: ProviderModeService) {}

  async record(request: CurationCostRecordRequest): Promise<void> {
    const curationId = CurationIdSchema.parse(request.curationId);
    const location = curationLocationFromDirectory(request.curationDir);
    if (location.curationId !== curationId) throw new CostFileCurationMismatchError(curationId, location.curationId);
    const session = CurationCostSessionSchema.parse(request.session);
    const key = curationCostSessionKey(session);
    // The USD written to cost.json must be the price table's, whoever computed it upstream.
    const expectedUsd = this.priceUsd(usageOfCurationCostSession(session));
    if (Math.abs(expectedUsd - session.usd) > COST_SUM_TOLERANCE_USD) {
      throw new CostSessionPriceMismatchError(key.sessionId, key.callIndex);
    }

    await this.curationFiles.run(curationId, async () => {
      const existing = await readCurationCost(location);
      const result = appendCurationCostSession({
        existing: existing.status === 'present' ? existing.value : null,
        curationId,
        priceTableVersion: this.priceTableVersion,
        session,
        now: new Date(),
      });
      if (result.outcome === 'appended') await writeCurationCost(location, result.file);
      this.logger.log({
        event: 'cost.curation-session-recorded',
        curationId,
        sessionId: key.sessionId,
        callIndex: key.callIndex,
        attempt: session.attempt,
        usd: session.usd,
        curationTotalUsd: result.file.totalUsd,
        outcome: result.outcome,
      });
    });
  }

  /**
   * B7: the price of `ceil(inputChars / 3)` input tokens plus `maxOutputTokens` output tokens, all
   * uncached. 0 in mock mode, like every mock call; throws `PriceNotAvailableError` for a live model
   * the table cannot price, so the caller refuses rather than calling on an unknown price.
   */
  async worstCaseUsd(request: CurationWorstCaseRequest): Promise<number> {
    assertCount(request.inputChars, 'inputChars');
    assertCount(request.maxOutputTokens, 'maxOutputTokens');
    return this.priceUsd({
      kind: 'model',
      modelId: request.modelId,
      inputTokens: Math.ceil(request.inputChars / WORST_CASE_CHARS_PER_TOKEN),
      outputTokens: Math.ceil(request.maxOutputTokens),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  }

  private priceUsd(usage: UsageQuantity): number {
    if (!this.modes.isLive('claude')) return 0;
    return priceUsage(PRICE_TABLE, usage);
  }
}
