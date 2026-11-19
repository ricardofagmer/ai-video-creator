import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type Sha256 } from '@studio/shared/catalog';
import { PrismaService } from '../prisma';
import { type ReviewedRunRow } from './curation-evidence.mapper';

/**
 * How runs that used a subject are found: `run_outcome_assets` for an asset version, the run index
 * recipe pin for a recipe version (SPEC 0005 section 5.3). The content hash is the pinned bytes.
 */
export type EvidenceSubjectKey =
  | { kind: 'asset'; assetVersionRowId: number; contentHash: Sha256 }
  | { kind: 'recipe'; recipeId: string; version: number; contentHash: Sha256 };

/** What the ground check re-reads about each evidence run (checks 2 and 3 of section 5.4). */
export interface EvidenceRunFacts {
  usedSubject: boolean;
  decision: string;
}

export interface ReviewNoteRow {
  runId: string;
  notes: string;
}

const reviewedRunSelect = {
  runId: true,
  decision: true,
  rating: true,
  reviewerScoresJson: true,
  qaMetricsJson: true,
  recoveries: true,
  costUsd: true,
} satisfies Prisma.RunOutcomeSelect;

/** Newest decision first; the run id breaks ties so pages are stable. */
const newestFirst: Prisma.RunOutcomeOrderByWithRelationInput[] = [{ decidedAt: 'desc' }, { runId: 'desc' }];

/** Evidence runs a proposal may cite (`evidenceRunIds` max 5). */
const MAX_FACT_RUNS = 5;

function usedSubjectWhere(key: EvidenceSubjectKey): Prisma.RunOutcomeWhereInput {
  if (key.kind === 'asset') return { assets: { some: { assetVersionId: key.assetVersionRowId, contentHash: key.contentHash } } };
  return { run: { recipeId: key.recipeId, recipeVersion: key.version, recipeContentHash: key.contentHash } };
}

/**
 * Read-only access to `run_outcomes` for the curation module (SPEC 0005 sections 5.1, 5.3, 5.4).
 * Only runs with a recorded owner decision have a row, so every run found here is reviewed.
 */
@Injectable()
export class CurationEvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** B4: a subject with no reviewed run is refused at the request and at the claim. */
  countReviewedRuns(key: EvidenceSubjectKey): Promise<number> {
    return this.prisma.runOutcome.count({ where: usedSubjectWhere(key) });
  }

  /** `outcomes.runs`: newest first, at most `limit` (20). */
  async listReviewedRuns(key: EvidenceSubjectKey, limit: number): Promise<ReviewedRunRow[]> {
    return this.prisma.runOutcome.findMany({ where: usedSubjectWhere(key), select: reviewedRunSelect, orderBy: newestFirst, take: limit });
  }

  /** `evidence`: the owner's review notes of the newest `limit` (5) runs that have any (L12). */
  async listReviewNotes(key: EvidenceSubjectKey, limit: number): Promise<ReviewNoteRow[]> {
    return this.prisma.runOutcome.findMany({
      where: { AND: [usedSubjectWhere(key), { notes: { not: '' } }] },
      select: { runId: true, notes: true },
      orderBy: newestFirst,
      take: limit,
    });
  }

  /** Re-read per evidence run id: did it pin the subject, and what did the owner decide. */
  async evidenceFacts(key: EvidenceSubjectKey, runIds: readonly string[]): Promise<Map<string, EvidenceRunFacts>> {
    const ids = [...new Set(runIds)].slice(0, MAX_FACT_RUNS);
    const facts = new Map<string, EvidenceRunFacts>();
    if (ids.length === 0) return facts;
    const rows = await this.prisma.runOutcome.findMany({ where: { runId: { in: ids } }, select: { runId: true, decision: true } });
    const used = await this.prisma.runOutcome.findMany({
      where: { AND: [{ runId: { in: ids } }, usedSubjectWhere(key)] },
      select: { runId: true },
    });
    const usedIds = new Set(used.map((row) => row.runId));
    for (const row of rows) facts.set(row.runId, { usedSubject: usedIds.has(row.runId), decision: row.decision });
    return facts;
  }
}
