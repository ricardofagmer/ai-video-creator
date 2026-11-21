import { Injectable } from '@nestjs/common';
import { Prisma, type PublicationAttempt } from '@prisma/client';
import { openPublishStates, publishBounds, type Platform, type PublishFailureReason } from '@studio/shared/platforms';
import { PrismaService, type PrismaTransaction } from '../../prisma';

/** A `queued` attempt about to be inserted (SPEC 0007 section 5.4 step 8); validated by the handler. */
export interface NewPublicationAttempt {
  attemptId: string;
  runId: string;
  platform: Platform;
  connectionId: string;
  mode: 'mock' | 'live';
  idempotencyKey: string;
  artifactSha256: string;
  artifactBytes: number;
  visibility: string;
  aiDisclosure: boolean;
  /** `publishMetadataSha256` of the body's metadata (finding F-3); never the title, caption or tags themselves. */
  metadataSha256: string;
  biometricRefs: readonly string[];
  biometricConfirmedAt: Date;
  approvalDecidedAt: Date;
  requestedBy: string;
  createdBy: 'api' | 'cli';
  correlationId: string | null;
  requestedAt: Date;
  expiresAt: Date;
}

/** `inserted`, or the unique index that refused it: the open-attempt partial index or the key. */
export type AttemptInsertResult = { status: 'inserted'; row: PublicationAttempt } | { status: 'conflict' };

/** The fields `PublishAttemptSync` copies from `state.json` into the row. */
export interface AttemptStateChange {
  state: string;
  reasonId: PublishFailureReason | null;
}

/** Withdrawn rows `PublishAttemptSync` re-checks in one pass (finding C4). */
const WITHDRAWN_ROWS_PER_PASS = 50;

/** A unique index refused the write: the idempotency key, or a second open attempt for the pair. */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Data access for `publication_attempts` (SPEC 0007 section 4.5). The partial unique index
 * `publication_attempts_open_key` (SQL only) refuses a second open attempt for a run and platform;
 * `idempotency_key` is unique. Every query is parameterized by Prisma. Titles, captions and tags
 * never reach this table: `visibility` is the only metadata field stored in clear; `metadata_sha256`
 * (finding F-3) holds only their hash, so a replay and the watcher can compare the body.
 */
@Injectable()
export class PublicationAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<PublicationAttempt | null> {
    return this.prisma.publicationAttempt.findUnique({ where: { idempotencyKey } });
  }

  async findInRun(runId: string, attemptId: string): Promise<PublicationAttempt | null> {
    return this.prisma.publicationAttempt.findFirst({ where: { id: attemptId, runId } });
  }

  /** Step 7: a studio or mock publication, or an attempt already `published`, for this run and platform. */
  async hasStudioPublication(runId: string, platform: Platform): Promise<boolean> {
    const publication = await this.prisma.runPublication.findFirst({
      where: { runId, platform, origin: { in: ['studio', 'mock'] } },
      select: { id: true },
    });
    if (publication !== null) return true;
    const published = await this.prisma.publicationAttempt.findFirst({ where: { runId, platform, state: 'published' }, select: { id: true } });
    return published !== null;
  }

  /** Step 8: one transaction; a unique index refusal answers `conflict` and leaves nothing behind. */
  async insertQueued(attempt: NewPublicationAttempt): Promise<AttemptInsertResult> {
    try {
      const row = await this.prisma.$transaction((tx) =>
        tx.publicationAttempt.create({
          data: {
            id: attempt.attemptId,
            runId: attempt.runId,
            platform: attempt.platform,
            connectionId: attempt.connectionId,
            mode: attempt.mode,
            idempotencyKey: attempt.idempotencyKey,
            state: 'queued',
            reasonId: null,
            artifactSha256: attempt.artifactSha256,
            artifactBytes: BigInt(attempt.artifactBytes),
            visibility: attempt.visibility,
            aiDisclosure: attempt.aiDisclosure,
            metadataSha256: attempt.metadataSha256,
            biometricRefsJson: JSON.stringify(attempt.biometricRefs),
            biometricConfirmedAt: attempt.biometricConfirmedAt,
            approvalDecidedAt: attempt.approvalDecidedAt,
            requestedBy: attempt.requestedBy,
            createdBy: attempt.createdBy,
            correlationId: attempt.correlationId,
            requestedAt: attempt.requestedAt,
            expiresAt: attempt.expiresAt,
          },
        }),
      );
      return { status: 'inserted', row };
    } catch (error) {
      if (isUniqueConstraintError(error)) return { status: 'conflict' };
      throw error;
    }
  }

  /** Step 9 failed: `failed` / `internal-error`, so no upload can follow. */
  async markRequestWriteFailed(attemptId: string): Promise<void> {
    await this.prisma.publicationAttempt.update({ where: { id: attemptId }, data: { state: 'failed', reasonId: 'internal-error' } });
  }

  /** Open attempts, oldest first; `runId` limits them to one run. */
  async listOpen(runId: string | null): Promise<PublicationAttempt[]> {
    return this.prisma.publicationAttempt.findMany({
      where: runId === null ? { state: { in: [...openPublishStates] } } : { runId, state: { in: [...openPublishStates] } },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * `cancelled` or `expired` rows changed at or after `since`, newest first (the likeliest to have
   * raced), bounded per pass: a cancel or an expiry can race the watcher's claim, so
   * `PublishAttemptSync` checks whether the upload happened anyway (finding C4).
   */
  async listRecentlyWithdrawn(runId: string | null, since: Date): Promise<PublicationAttempt[]> {
    const withdrawn = { state: { in: ['cancelled', 'expired'] }, updatedAt: { gte: since } };
    return this.prisma.publicationAttempt.findMany({
      where: runId === null ? withdrawn : { runId, ...withdrawn },
      orderBy: { id: 'desc' },
      take: WITHDRAWN_ROWS_PER_PASS,
    });
  }

  /**
   * Finding R2: the withdrawn (`cancelled` or `expired`) attempts of one run and platform changed at
   * or after `since`, newest first, bounded like `listRecentlyWithdrawn`. `RequestPublish` step 7
   * checks whether one of them was claimed and is uploading anyway.
   */
  async listRecentlyWithdrawnForPair(options: { runId: string; platform: Platform; since: Date }): Promise<PublicationAttempt[]> {
    return this.prisma.publicationAttempt.findMany({
      where: { runId: options.runId, platform: options.platform, state: { in: ['cancelled', 'expired'] }, updatedAt: { gte: options.since } },
      orderBy: { id: 'desc' },
      take: WITHDRAWN_ROWS_PER_PASS,
    });
  }

  /** `published` attempts not linked to a publication yet (a link that failed earlier is retried). */
  async listPublishedUnlinked(runId: string | null): Promise<PublicationAttempt[]> {
    return this.prisma.publicationAttempt.findMany({
      where: runId === null ? { state: 'published', publicationId: null } : { runId, state: 'published', publicationId: null },
      orderBy: { id: 'asc' },
    });
  }

  /** The newest attempts of a run, newest first (the dialog shows 10). */
  async listRecent(runId: string): Promise<PublicationAttempt[]> {
    return this.prisma.publicationAttempt.findMany({ where: { runId }, orderBy: { id: 'desc' }, take: publishBounds.attemptsShown });
  }

  /** Copies a state only while the row still holds `from`, so two syncs cannot move it twice. */
  async moveState(
    options: { attemptId: string; from: string; change: AttemptStateChange },
    db: PrismaTransaction = this.prisma,
  ): Promise<boolean> {
    const updated = await db.publicationAttempt.updateMany({
      where: { id: options.attemptId, state: options.from },
      data: { state: options.change.state, reasonId: options.change.reasonId },
    });
    return updated.count === 1;
  }

  async linkPublication(attemptId: string, publicationId: string, db: PrismaTransaction): Promise<void> {
    await db.publicationAttempt.update({ where: { id: attemptId }, data: { publicationId } });
  }
}
