import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type ParsedAssetRef } from '@studio/shared/catalog';
import { PrismaService } from '../prisma';
import { AttemptUploadEvidence } from './attempt-upload-evidence.reader';

/** Statuses a run has once it reached `review` (C3 `RunStatus`). */
const REVIEWED_STATUSES = ['review', 'approved', 'rejected'];

/** Attempt states that never reached `uploading`: no byte left the machine (SPEC 0007 section 5.4). */
const NEVER_UPLOADED_STATES = ['queued', 'cancelled', 'expired'];

/**
 * `failed` reasons the watcher writes at its re-check, before `uploading` (SPEC 0007 section 5.5),
 * so the attempt sent nothing.
 */
const PRE_UPLOAD_FAILURE_REASONS = ['run-not-approved', 'gate-closed', 'mode-mismatch', 'account-not-connected', 'artifact-missing', 'artifact-changed'];

/**
 * `failed` reasons the watcher writes either before any byte or during an upload (finding C8): a
 * revoked token at the re-check or mid-upload, an internal error, a restart. Such an attempt is
 * left out only when its run's `publications.jsonl` shows no `upload-started` line for it.
 */
const BEFORE_OR_DURING_UPLOAD_REASONS = ['token-revoked', 'internal-error', 'watcher-interrupted'];

/** Attempts whose `publications.jsonl` is checked per count; any beyond stay counted. */
const MAX_EVIDENCE_CHECKS = 200;

/** Ids per `IN (...)` or `OR` query; well under SQLite's bound-parameter limit. */
const KEYS_PER_QUERY = 200;

export interface ReviewedRunRow {
  runId: string;
  recipeId: string;
  createdAt: Date;
  costUsd: number;
}

export interface OutcomeRow {
  runId: string;
  decision: string;
  rating: number;
  decidedAt: Date;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

export function assetVersionKey(version: ParsedAssetRef): string {
  return `${version.assetId}@${version.version}`;
}

/**
 * The SQLite reads behind `GetStudioInsightsQuery`: the run index, outcomes, asset version
 * creation times and publications. Read-only; every query is parameterized by Prisma.
 */
@Injectable()
export class InsightsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadEvidence: AttemptUploadEvidence,
  ) {}

  /** Runs that reached review, newest first; asks for `limit` rows. */
  async reviewedRuns(limit: number): Promise<ReviewedRunRow[]> {
    const rows = await this.prisma.runIndexEntry.findMany({
      where: { status: { in: REVIEWED_STATUSES } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true, recipeId: true, createdAt: true, costUsd: true },
    });
    return rows.map((row) => ({ runId: row.id, recipeId: row.recipeId, createdAt: row.createdAt, costUsd: row.costUsd }));
  }

  async outcomes(runIds: readonly string[]): Promise<OutcomeRow[]> {
    const rows: OutcomeRow[] = [];
    for (const ids of chunk(runIds, KEYS_PER_QUERY)) {
      rows.push(
        ...(await this.prisma.runOutcome.findMany({
          where: { runId: { in: ids } },
          select: { runId: true, decision: true, rating: true, decidedAt: true },
        })),
      );
    }
    return rows;
  }

  /** Creation time of each asset version that exists, keyed by `assetId@version`. */
  async versionCreatedAt(versions: readonly ParsedAssetRef[]): Promise<Map<string, Date>> {
    const createdAt = new Map<string, Date>();
    for (const keys of chunk(versions, KEYS_PER_QUERY)) {
      const rows = await this.prisma.assetVersion.findMany({
        where: { OR: keys.map((key) => ({ assetId: key.assetId, version: key.version })) },
        select: { assetId: true, version: true, createdAt: true },
      });
      for (const row of rows) createdAt.set(assetVersionKey(row), row.createdAt);
    }
    return createdAt;
  }

  /**
   * Videos that left without a recorded approval (SPEC 0007 section 5.10); the handler rules keep it
   * at 0 and this query exists to prove it. Two terms, so a studio publication is counted once:
   * - pasted publications (`attempt_id` null) whose run has no `approved` outcome;
   * - `publication_attempts` that reached `uploading` or later (bytes may have left; a studio or
   *   mock publication always has one) whose outcome is not `approved`, or whose
   *   `approval_decided_at` is later than `requested_at`. A `failed` attempt with a reason the
   *   watcher writes before any byte is left out; one with a reason it writes before or during an
   *   upload is left out only when its run's `publications.jsonl` proves no byte was sent (C8).
   */
  async unapprovedPublicationCount(): Promise<number> {
    const pasted = await this.prisma.runPublication.count({
      where: { attemptId: null, outcome: { decision: { not: 'approved' } } },
    });
    const unapproved: Prisma.PublicationAttemptWhereInput = {
      state: { notIn: [...NEVER_UPLOADED_STATES] },
      NOT: { state: 'failed', reasonId: { in: [...PRE_UPLOAD_FAILURE_REASONS] } },
      OR: [
        { outcome: { decision: { not: 'approved' } } },
        { approvalDecidedAt: { gt: this.prisma.publicationAttempt.fields.requestedAt } },
      ],
    };
    const attempts = await this.prisma.publicationAttempt.count({ where: unapproved });
    const ambiguous = await this.prisma.publicationAttempt.findMany({
      where: { AND: [unapproved, { state: 'failed', reasonId: { in: [...BEFORE_OR_DURING_UPLOAD_REASONS] } }] },
      orderBy: { id: 'desc' },
      take: MAX_EVIDENCE_CHECKS,
      select: { id: true, runId: true },
    });
    let sentNothing = 0;
    for (const attempt of ambiguous) {
      if (await this.uploadEvidence.sentNoByte({ runId: attempt.runId, attemptId: attempt.id })) sentNothing += 1;
    }
    return pasted + attempts - sentNothing;
  }
}
