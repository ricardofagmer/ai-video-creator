import { Injectable } from '@nestjs/common';
import { type PromotionApproval as PromotionApprovalRow } from '@prisma/client';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { type PromotionTarget } from './promote-version.command';
import { toEvidenceJson, type ActivationFacts } from './promotion-approval.mapper';
import { type PromotionEvidence } from './promotion-input';

/** One approval as recorded; `decidedAt` is the server clock, `decidedBy` the session's owner. */
export interface NewPromotionApproval {
  target: PromotionTarget;
  /** `asset_versions.id` or `recipe_versions.id`, matching `target`. */
  versionRowId: number;
  decidedBy: string;
  decidedAt: Date;
  reason: string;
  evidence: PromotionEvidence;
  replacedVersion: number | null;
  qualityScoreAtApproval: number | null;
  sampleSizeAtApproval: number;
  correlationId: string | null;
}

/** Hard bound on one activation lookup; the api pages versions at 100 at most. */
export const MAX_ACTIVATION_LOOKUP = 100;

/** An asset or recipe id with a version number. */
export interface VersionKey {
  id: string;
  version: number;
}

export interface StoredActivationFacts extends VersionKey, ActivationFacts {}

/**
 * Data access for `promotion_approvals` (SPEC 0003 section 4.4). Append-only: it inserts and reads;
 * it has no update or delete, and the database triggers refuse both anyway. The handler owns the
 * transaction and passes it in.
 */
@Injectable()
export class PromotionApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(approval: NewPromotionApproval, db: PrismaTransaction): Promise<PromotionApprovalRow> {
    return db.promotionApproval.create({
      data: {
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
        correlationId: approval.correlationId,
      },
    });
  }

  /** Approvals of `target` by id; ids that name another target kind are not returned. */
  async findByIds(target: PromotionTarget, ids: readonly number[], db: PrismaTransaction = this.prisma): Promise<PromotionApprovalRow[]> {
    if (ids.length === 0) return [];
    return db.promotionApproval.findMany({ where: { targetKind: target, id: { in: [...ids] } }, take: MAX_ACTIVATION_LOOKUP });
  }

  /**
   * Status and approval id of the named versions (`id`/`version` pairs of `target`). Read-only;
   * never selects `embedding_json`.
   */
  async findActivationFacts(target: PromotionTarget, versions: readonly VersionKey[]): Promise<StoredActivationFacts[]> {
    if (versions.length === 0) return [];
    const select = { id: true, version: true, status: true, activationApprovalId: true } as const;
    if (target === 'asset-version') {
      const rows = await this.prisma.assetVersion.findMany({
        where: { OR: versions.map((key) => ({ assetId: key.id, version: key.version })) },
        select: { ...select, assetId: true },
        take: MAX_ACTIVATION_LOOKUP,
      });
      return rows.map((row) => ({ id: row.assetId, version: row.version, rowId: row.id, status: row.status, activationApprovalId: row.activationApprovalId }));
    }
    const rows = await this.prisma.recipeVersion.findMany({
      where: { OR: versions.map((key) => ({ recipeId: key.id, version: key.version })) },
      select: { ...select, recipeId: true },
      take: MAX_ACTIVATION_LOOKUP,
    });
    return rows.map((row) => ({ id: row.recipeId, version: row.version, rowId: row.id, status: row.status, activationApprovalId: row.activationApprovalId }));
  }

  /**
   * Evidence ids that do not exist (B16: named ids must exist, nothing more is required). Runs are
   * checked against the run index, comparisons against the comparisons index.
   */
  async findMissingEvidence(evidence: PromotionEvidence, db: PrismaTransaction): Promise<{ comparisonId: string | null; runIds: string[] }> {
    let missingComparison: string | null = null;
    if (evidence.comparisonId !== null) {
      const comparison = await db.comparison.findUnique({ where: { id: evidence.comparisonId }, select: { id: true } });
      if (comparison === null) missingComparison = evidence.comparisonId;
    }
    let missingRuns: string[] = [];
    if (evidence.runIds.length > 0) {
      const found = await db.runIndexEntry.findMany({ where: { id: { in: evidence.runIds } }, select: { id: true } });
      const foundIds = new Set(found.map((entry) => entry.id));
      missingRuns = evidence.runIds.filter((runId) => !foundIds.has(runId));
    }
    return { comparisonId: missingComparison, runIds: missingRuns };
  }
}
