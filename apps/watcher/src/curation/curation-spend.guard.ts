import { Inject, Injectable, Logger } from '@nestjs/common';
import { MOCK_MODEL_ID, curatorAgentDefinition, worstCaseInputChars } from '@studio/core/agents';
import { CostLedgerService, CurationCostLedger } from '@studio/core/costs';
import {
  CURATION_MONTH_CEILING_USD,
  decideCurationMonthGate,
  decideCuratorCallBudget,
  type CuratorCallBudgetDecision,
  type CurationMonthGateDecision,
} from '@studio/core/curation';
import { ProviderModeService } from '@studio/core/providers';
import { curationBounds, type CuratorTaskPacket } from '@studio/shared/curation';
import { type CurationCostPort } from '@studio/shared/ports';
import { type ModelId } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';
import { errorName } from '../platform/error-name';
import { CURATION_CLOCK } from './curation.tokens';

/**
 * The watcher's spend gates (topology 0004 section 7, SPEC 0005 section 5.2, C5-AC-07, C5-AC-08),
 * both fail closed: the month gate before each call (month-to-date plus what this curation may
 * still spend against the $60 default ceiling, B9), and the $1.00 bound (spend so far plus the
 * call's worst case). An unknown month figure or an unpriceable model refuses the call.
 */
@Injectable()
export class CurationSpendGuard {
  private readonly logger = new Logger(CurationSpendGuard.name);

  constructor(
    @Inject(CostLedgerService) private readonly ledger: CostLedgerService,
    @Inject(CurationCostLedger) private readonly curationCost: CurationCostPort,
    @Inject(ProviderModeService) private readonly modes: ProviderModeService,
    @Inject(CURATION_CLOCK) private readonly clock: Clock,
  ) {}

  /** The model the Curator agent will use, chosen by the same rule (mock unless `claude` is live). */
  curatorModelId(): ModelId {
    return this.modes.isLive('claude') ? curatorAgentDefinition.defaultModelId : MOCK_MODEL_ID;
  }

  async monthGate(spentUsd: number): Promise<CurationMonthGateDecision> {
    let monthToDateUsd: number | null = null;
    try {
      monthToDateUsd = await this.ledger.monthToDateUsd(this.clock.now());
    } catch (error) {
      this.logger.warn({ event: 'curation.month-spend-unavailable', error: errorName(error) });
    }
    return decideCurationMonthGate({
      monthToDateUsd,
      reserveUsd: curationBounds.maxUsd - spentUsd,
      costPerMonthUsd: CURATION_MONTH_CEILING_USD,
    });
  }

  async callBudget(request: { spentUsd: number; modelId: ModelId; inputChars: number }): Promise<CuratorCallBudgetDecision> {
    let worstCaseUsd = Number.NaN;
    try {
      worstCaseUsd = await this.curationCost.worstCaseUsd({
        modelId: request.modelId,
        inputChars: request.inputChars,
        maxOutputTokens: curationBounds.maxOutputTokens,
      });
    } catch (error) {
      // NaN makes the pure decision refuse: no call on an unknown price.
      this.logger.warn({ event: 'curation.worst-case-unavailable', modelId: request.modelId, error: errorName(error) });
    }
    return decideCuratorCallBudget({ spentUsd: request.spentUsd, worstCaseUsd });
  }

  /** Both gates for call 2; a refusal ends the curation as attempt 2 would have (SPEC 0005 section 5.2). */
  async secondCallFits(request: { spentUsd: number; modelId: ModelId; packet: CuratorTaskPacket }): Promise<boolean> {
    const month = await this.monthGate(request.spentUsd);
    if (month.decision === 'refuse') return false;
    const budget = await this.callBudget({
      spentUsd: request.spentUsd,
      modelId: request.modelId,
      inputChars: worstCaseInputChars(request.packet, true),
    });
    return budget.decision === 'call';
  }
}
