import { type GateDecisionRequest, type ReviewDecisionRequest } from '@studio/shared/api';
import { type CorrelationId, type GateDecision } from '@studio/shared/run-format';
import { type Principal } from '../platform/request-context';

/** Who and when, from the session and the server clock; C10 request bodies cannot carry them. */
export interface DecisionAuthority {
  principal: Principal;
  decidedAt: Date;
  correlationId: CorrelationId | null;
}

function authorityFields(authority: DecisionAuthority): Pick<GateDecision, 'decidedBy' | 'decidedAt' | 'correlationId'> {
  return {
    decidedBy: authority.principal.subject,
    decidedAt: authority.decidedAt.toISOString(),
    correlationId: authority.correlationId,
  };
}

/** A C3 `plan` or `recipe-gate` decision. */
export function toGateDecision(request: GateDecisionRequest, authority: DecisionAuthority): GateDecision {
  return { ...request, ...authorityFields(authority) };
}

/** A C3 `final` decision (D14 review form). */
export function toReviewDecision(request: ReviewDecisionRequest, authority: DecisionAuthority): GateDecision {
  return { ...request, kind: 'final', ...authorityFields(authority) };
}
