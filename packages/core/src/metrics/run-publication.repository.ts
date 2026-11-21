import { Injectable } from '@nestjs/common';
import { Prisma, type RunPublication } from '@prisma/client';
import { type PublicationView } from '@studio/shared/api';
import { metricsBounds, type Platform, type Publication } from '@studio/shared/metrics';
import { type PublicationOrigin } from '@studio/shared/platforms';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { toPublication, toPublicationView } from './metrics.mapper';

/** Video ids per `IN (...)` query; well under SQLite's bound-parameter limit. */
const VIDEO_IDS_PER_QUERY = 500;

/** A publication about to be inserted; every field is validated by the handler first. */
export interface NewPublication {
  publicationId: string;
  runId: string;
  platform: Platform;
  platformVideoId: string;
  /** The canonical URL rebuilt by `parsePublicationUrl`. */
  url: string;
  publishedOn: string | null;
  recordedBy: string;
  correlationId: string | null;
  recordedAt: Date;
  /** `manual` for a pasted link (SPEC 0007 section 4.5); `studio` and `mock` rows come from an attempt. */
  origin: PublicationOrigin;
  /** The attempt that created a `studio` or `mock` row; null exactly for `manual`. */
  attemptId: string | null;
  platformMediaId: string | null;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Data access for `run_publications` (SPEC 0006 sections 4.5, 5.1) and the one `run_outcomes`
 * column the publication rule reads. Writes are one insert per publication and a delete of a
 * publication without snapshots; the metrics command handlers own the transaction and pass it in.
 * Every query is parameterized by Prisma.
 */
@Injectable()
export class RunPublicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `run_outcomes.decision` of the run, or null when it has no outcome row (not reviewed). */
  async findOutcomeDecision(runId: string, db: PrismaTransaction = this.prisma): Promise<string | null> {
    const row = await db.runOutcome.findUnique({ where: { runId }, select: { decision: true } });
    return row === null ? null : row.decision;
  }

  async countByRun(runId: string, db: PrismaTransaction = this.prisma): Promise<number> {
    return db.runPublication.count({ where: { runId } });
  }

  /**
   * Publication counts for a page of runs in one grouped query (`GROUP BY run_id`), so a run list
   * never issues one count per row. Runs without publications are absent from the answer.
   */
  async countByRuns(runIds: readonly string[], db: PrismaTransaction = this.prisma): Promise<Map<string, number>> {
    if (runIds.length === 0) return new Map();
    const rows = await db.runPublication.groupBy({
      by: ['runId'],
      where: { runId: { in: [...runIds] } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.runId, row._count._all]));
  }

  /** The run a platform video is linked to, if any; the unique index allows at most one. */
  async findLinkedRunId(platform: Platform, platformVideoId: string, db: PrismaTransaction = this.prisma): Promise<string | null> {
    const row = await db.runPublication.findUnique({
      where: { platform_platformVideoId: { platform, platformVideoId } },
      select: { runId: true },
    });
    return row === null ? null : row.runId;
  }

  /** The unique index refuses a video already linked; callers map that to their domain error. */
  async insert(publication: NewPublication, db: PrismaTransaction): Promise<PublicationView> {
    const row = await db.runPublication.create({
      data: {
        id: publication.publicationId,
        runId: publication.runId,
        platform: publication.platform,
        platformVideoId: publication.platformVideoId,
        url: publication.url,
        publishedOn: publication.publishedOn,
        recordedBy: publication.recordedBy,
        correlationId: publication.correlationId,
        recordedAt: publication.recordedAt,
        origin: publication.origin,
        attemptId: publication.attemptId,
        platformMediaId: publication.platformMediaId,
      },
    });
    return toPublicationView(row);
  }

  /** The publication only when it belongs to `runId`, so a route never reaches another run's row. */
  async findInRun(runId: string, publicationId: string, db: PrismaTransaction = this.prisma): Promise<Publication | null> {
    const row = await db.runPublication.findFirst({ where: { id: publicationId, runId } });
    return row === null ? null : toPublication(row);
  }

  /** The foreign key from snapshots (RESTRICT) also refuses this when a snapshot exists. */
  async delete(publicationId: string, db: PrismaTransaction): Promise<void> {
    await db.runPublication.delete({ where: { id: publicationId }, select: { id: true } });
  }

  /**
   * The run page's publication rows, oldest first; at most `maxPublicationsPerRun` exist. Rows, not
   * views, so the caller can add the polling line before mapping with `toPublicationView`.
   */
  async listRowsByRun(runId: string, db: PrismaTransaction = this.prisma): Promise<RunPublication[]> {
    return db.runPublication.findMany({
      where: { runId },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
      take: metricsBounds.maxPublicationsPerRun,
    });
  }

  /**
   * A pulled batch's matching set (SPEC 0007 section 5.6): publications of `platform` among
   * `publicationIds`, restricted by the batch mode so a simulated number lands only on a simulated
   * publication and a live number never does (B6). A batch holds at most 50 rows.
   */
  async findForBatch(
    batch: { platform: Platform; mode: 'mock' | 'live'; publicationIds: readonly string[] },
    db: PrismaTransaction = this.prisma,
  ): Promise<Publication[]> {
    if (batch.publicationIds.length === 0) return [];
    const rows = await db.runPublication.findMany({
      where: {
        platform: batch.platform,
        id: { in: [...new Set(batch.publicationIds)] },
        origin: batch.mode === 'mock' ? 'mock' : { not: 'mock' },
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(toPublication);
  }

  /** The import's matching set: publications of `platform` whose video id is in `platformVideoIds`. */
  async findByVideoIds(platform: Platform, platformVideoIds: readonly string[], db: PrismaTransaction = this.prisma): Promise<Publication[]> {
    const unique = [...new Set(platformVideoIds)];
    const publications: Publication[] = [];
    for (let start = 0; start < unique.length; start += VIDEO_IDS_PER_QUERY) {
      const rows = await db.runPublication.findMany({
        where: { platform, platformVideoId: { in: unique.slice(start, start + VIDEO_IDS_PER_QUERY) } },
        orderBy: { id: 'asc' },
      });
      publications.push(...rows.map(toPublication));
    }
    return publications;
  }
}
