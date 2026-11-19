import { z } from 'zod';
import { CorrelationIdSchema, IsoDateTimeSchema, RunIdSchema } from '../common/ids';
import { type ChecklistItem } from '../recipes/recipe-parts';
import { GateIdSchema, reservedGateIds, type GateId } from './vocabulary';

const decisionShape = {
  outcome: z.enum(['approved', 'rejected']),
  decidedBy: z.string().min(1).max(100),
  decidedAt: IsoDateTimeSchema,
  notes: z.string().max(4000),
  correlationId: CorrelationIdSchema.nullable(),
};

/**
 * A human gate answer (SPEC 0002 A6). `final` carries the review form of D14: 1-5 rating, notes
 * and the recipe checklist.
 */
export const GateDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ ...decisionShape, kind: z.literal('plan') }).strict(),
  z
    .object({
      ...decisionShape,
      kind: z.literal('recipe-gate'),
      gate: GateIdSchema.refine((gate) => !reservedGateIds.includes(gate), { message: 'use kind plan or final' }),
    })
    .strict(),
  z
    .object({
      ...decisionShape,
      kind: z.literal('final'),
      rating: z.number().int().min(1).max(5),
      checklist: z
        .array(z.object({ itemId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/), checked: z.boolean() }).strict())
        .max(20),
    })
    .strict(),
]);
export type GateDecision = z.infer<typeof GateDecisionSchema>;

/**
 * `runs/<runId>/approval.json`: the list of gate decisions, written only by the api or CLI and
 * only while no watcher step is in progress. A gate may be answered again after the run returns
 * to it; the decision with the latest `decidedAt` for a gate is the one in force.
 */
export const ApprovalFileSchema = z
  .object({
    runId: RunIdSchema,
    decisions: z.array(GateDecisionSchema).max(100),
  })
  .strict();
export type ApprovalFile = z.infer<typeof ApprovalFileSchema>;

export function gateOf(decision: GateDecision): GateId {
  return decision.kind === 'recipe-gate' ? decision.gate : decision.kind;
}

/** The decision in force for a gate, or undefined when the gate was never answered. */
export function latestDecision(approval: ApprovalFile, gate: GateId): GateDecision | undefined {
  return approval.decisions
    .filter((decision) => gateOf(decision) === gate)
    .reduce<GateDecision | undefined>(
      (latest, decision) =>
        latest === undefined || Date.parse(decision.decidedAt) >= Date.parse(latest.decidedAt) ? decision : latest,
      undefined,
    );
}

/** Required checklist items left unchecked; a final approval with any of them is refused (R1-17). */
export function uncheckedRequiredItems(checklist: readonly ChecklistItem[], decision: GateDecision): string[] {
  if (decision.kind !== 'final' || decision.outcome !== 'approved') return [];
  const checked = new Set(decision.checklist.filter((answer) => answer.checked).map((answer) => answer.itemId));
  return checklist.filter((item) => item.required && !checked.has(item.id)).map((item) => item.id);
}
