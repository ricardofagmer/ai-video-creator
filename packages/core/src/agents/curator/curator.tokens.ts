import { type CostLedgerPort } from '@studio/shared/ports';

/**
 * C6 `CurationCostPort` (SPEC 0005 section 5.8). Bound by the composition root to the C5-02
 * ledger; the agents folder imports the port type only, never `costs/` or `curation/`.
 */
export const CURATION_COST_PORT = Symbol('CURATION_COST_PORT');

/** The versioned price table the Curator prices each billed call with (ADR 0002 "Cost"). */
export const CURATOR_PRICING = Symbol('CURATOR_PRICING');

/** What the Curator needs of the cost ledger: pricing only; `cost.json` goes through the port. */
export type CuratorPricing = Pick<CostLedgerPort, 'priceUsd'>;
