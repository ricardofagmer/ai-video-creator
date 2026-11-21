import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@studio/core/prisma';
import { PlatformSchema, type Platform } from '@studio/shared/platforms';

/** One `run_publications` row as the poll needs it; the canonical URL is never read. */
export interface PollTargetRow {
  publicationId: string;
  platform: Platform;
  platformVideoId: string;
  publishedOn: string | null;
  recordedAt: Date;
  origin: string;
  platformMediaId: string | null;
}

export interface PollTargetList {
  rows: PollTargetRow[];
  /** True when the read hit `MAX_POLL_TARGET_ROWS`: the list is a prefix, so no cursor entry is dropped. */
  truncated: boolean;
}

/** Bound on one read; a studio holds a few publications per run, far below this. */
export const MAX_POLL_TARGET_ROWS = 10_000;

/**
 * The poll targets (SPEC 0007 section 5.5 step 1, L2): `run_publications`, read-only. The watcher
 * reads SQLite and never writes it (K1); this is a single `findMany`, and no Prisma write exists in
 * the watcher (AC 57). A row whose platform is outside the enum is skipped, never guessed.
 */
@Injectable()
export class PublicationTargetsReader {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(): Promise<PollTargetList> {
    const found = await this.prisma.runPublication.findMany({
      select: { id: true, platform: true, platformVideoId: true, publishedOn: true, recordedAt: true, origin: true, platformMediaId: true },
      orderBy: { recordedAt: 'asc' },
      take: MAX_POLL_TARGET_ROWS,
    });
    const rows = found.flatMap((row): PollTargetRow[] => {
      const platform = PlatformSchema.safeParse(row.platform);
      if (!platform.success) return [];
      return [
        {
          publicationId: row.id,
          platform: platform.data,
          platformVideoId: row.platformVideoId,
          publishedOn: row.publishedOn,
          recordedAt: row.recordedAt,
          origin: row.origin,
          platformMediaId: row.platformMediaId,
        },
      ];
    });
    return { rows, truncated: found.length >= MAX_POLL_TARGET_ROWS };
  }
}
