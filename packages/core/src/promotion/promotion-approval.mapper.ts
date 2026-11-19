import { type Prisma, type PromotionApproval as PromotionApprovalRow } from '@prisma/client';
import { PromotionApprovalViewSchema, type PromotionApprovalView } from '@studio/shared/api';
import { type PromotionTarget } from './promote-version.command';
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

/**
 * The score facts an approval freezes (SPEC 0006 R3-AC-07): the owner approved against both sample
 * sizes, so both are recorded next to the score, never re-read from the version later.
 */
export interface ApprovalScores {
  qualityScoreAtApproval: number | null;
  sampleSizeAtApproval: number;
  /** `null` only when no platform figure exists for the target (recipes, legacy rows). */
  platformSampleSizeAtApproval: number | null;
}

/** One approval as recorded; `decidedAt` is the server clock, `decidedBy` the session's owner. */
export interface NewPromotionApproval extends ApprovalScores {
  target: PromotionTarget;
  /** `asset_versions.id` or `recipe_versions.id`, matching `target`. */
  versionRowId: number;
  decidedBy: string;
  decidedAt: Date;
  reason: string;
  evidence: PromotionEvidence;
  replacedVersion: number | null;
  correlationId: string | null;
}

/** The score columns of an `asset_versions` row that an approval freezes. */
export interface AssetVersionScoreColumns {
  qualityScore: number | null;
  qualitySampleSize: number;
  qualityPlatformSampleSize: number;
}

export function assetApprovalScores(version: AssetVersionScoreColumns): ApprovalScores {
  return {
    qualityScoreAtApproval: version.qualityScore,
    sampleSizeAtApproval: version.qualitySampleSize,
    platformSampleSizeAtApproval: version.qualityPlatformSampleSize,
  };
}

/**
 * Recipes carry no quality score and no platform figure (section 5.1 scores asset versions only).
 * The run count stays 0 because its column is NOT NULL; the platform count is NULL so the view says
 * "no figure" instead of claiming zero platform metrics were seen.
 */
export const RECIPE_APPROVAL_SCORES: Readonly<ApprovalScores> = Object.freeze({
  qualityScoreAtApproval: null,
  sampleSizeAtApproval: 0,
  platformSampleSizeAtApproval: null,
});

/** Canonical `evidence_json`: both keys always present, so the stored form is stable. */
function toEvidenceJson(evidence: PromotionEvidence): string {
  return JSON.stringify({ comparisonId: evidence.comparisonId, runIds: evidence.runIds });
}

/** `promotion_approvals` insert data; exactly the id column matching `target` is set (CHECK). */
export function toApprovalCreateData(approval: NewPromotionApproval): Prisma.PromotionApprovalUncheckedCreateInput {
  return {
    targetKind: approval.target,
    assetVersionId: approval.target === 'asset-version' ? approval.versionRowId : null,
    recipeVersionId: approval.target === 'recipe-version' ? approval.versionRowId : null,
    decidedBy: approval.decidedBy,
    decidedAt: approval.decidedAt,
    reason: approval.reason,
    evidenceJson: toEvidenceJson(approval.evidence),
    replacedVersion: approval.replacedVersion,
    qualityScoreAtApproval: approval.qualityScoreAtApproval,
    sampleSizeAtApproval: approval.sampleSizeAtApproval,
    platformSampleSizeAtApproval: approval.platformSampleSizeAtApproval,
    correlationId: approval.correlationId,
  };
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
    // NULL on recipe approvals and on approvals recorded before the column existed: not recorded, never 0.
    platformSampleSizeAtApproval: row.platformSampleSizeAtApproval,
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
