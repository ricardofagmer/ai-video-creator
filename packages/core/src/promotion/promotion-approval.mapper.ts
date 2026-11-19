import { type PromotionApproval as PromotionApprovalRow } from '@prisma/client';
import { PromotionApprovalViewSchema, type PromotionApprovalView } from '@studio/shared/api';
import { type PromotionEvidence } from './promotion-input';
import { PromotionApprovalCorruptError } from './promotion.errors';

function parseEvidence(row: PromotionApprovalRow): unknown {
  try {
    const parsed: unknown = JSON.parse(row.evidenceJson);
    return parsed;
  } catch (error) {
    throw new PromotionApprovalCorruptError(row.id, { cause: error });
  }
}

/** Canonical `evidence_json`: both keys always present, so the stored form is stable. */
export function toEvidenceJson(evidence: PromotionEvidence): string {
  return JSON.stringify({ comparisonId: evidence.comparisonId, runIds: evidence.runIds });
}

/**
 * The `activation` view mapper (C10 `PromotionApprovalView`): one `promotion_approvals` row, re-
 * validated whole so a drifted row never reaches a response.
 */
export function toPromotionApprovalView(row: PromotionApprovalRow): PromotionApprovalView {
  const candidate: Record<string, unknown> = {
    approvalId: row.id,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt.toISOString(),
    reason: row.reason,
    evidence: parseEvidence(row),
    replacedVersion: row.replacedVersion,
    qualityScoreAtApproval: row.qualityScoreAtApproval,
    sampleSizeAtApproval: row.sampleSizeAtApproval,
  };
  const parsed = PromotionApprovalViewSchema.safeParse(candidate);
  if (!parsed.success) throw new PromotionApprovalCorruptError(row.id);
  return parsed.data;
}

/** A version's activation facts as the version row stores them. */
export interface ActivationFacts {
  rowId: number;
  status: string;
  activationApprovalId: number | null;
}

/**
 * `AssetVersionView.activation` / `RecipeVersionView.activation`: the approval that made the
 * version `active`, or null when it is not active or was active before the R2 migration (B15).
 * The approval must name this very row; anything else is corrupt, never shown as someone's
 * approval of another version.
 */
export function toActivationView(facts: ActivationFacts, approval: PromotionApprovalRow | null): PromotionApprovalView | null {
  if (facts.status !== 'active' || facts.activationApprovalId === null) return null;
  if (approval === null || approval.id !== facts.activationApprovalId) {
    throw new PromotionApprovalCorruptError(facts.activationApprovalId);
  }
  const targetRowId = approval.targetKind === 'asset-version' ? approval.assetVersionId : approval.recipeVersionId;
  if (targetRowId !== facts.rowId) throw new PromotionApprovalCorruptError(approval.id);
  return toPromotionApprovalView(approval);
}
