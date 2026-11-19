import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { metricsBounds, type Platform, type Publication } from '@studio/shared/metrics';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { toPublication } from './metrics.mapper';

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

  /** The run a platform video is linked to, if any; the unique index allows at most one. */
  async findLinkedRunId(platform: Platform, platformVideoId: string, db: PrismaTransaction = this.prisma): Promise<string | null> {
    const row = await db.runPublication.findUnique({
      where: { platform_platformVideoId: { platform, platformVideoId } },
      select: { runId: true },
    });
    return row === null ? null : row.runId;
  }

  /** The unique index refuses a video already linked; callers map that to their domain error. */
  async insert(publication: NewPublication, db: PrismaTransaction): Promise<Publication> {
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
      },
    });
    return toPublication(row);
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

  /** The run page's publications, oldest first; at most `maxPublicationsPerRun` exist. */
  async listByRun(runId: string, db: PrismaTransaction = this.prisma): Promise<Publication[]> {
    const rows = await db.runPublication.findMany({
      where: { runId },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
      take: metricsBounds.maxPublicationsPerRun,
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
