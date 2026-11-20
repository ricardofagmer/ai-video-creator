import { Injectable } from '@nestjs/common';
import { type Prisma, type RunIndexEntry as RunIndexRow } from '@prisma/client';
import { type RunStatus } from '@studio/shared/run-format';
import { PrismaService } from '../prisma/prisma.service';
import { type ComparisonIndexData } from './run-comparison';
import { type RunIndexData } from './run-index.mapper';

export interface RunIndexKeysetPage {
  /** Run id (a ULID, so time-ordered) the page starts after, newest first; null for the first page. */
  beforeRunId: string | null;
  limit: number;
}

export interface RunIndexRowPage {
  rows: RunIndexRow[];
  total: number;
  hasMore: boolean;
}

/**
 * Data access for the derived mirror of the run folders (ADR 0003): `run_index_entries`, and the
 * `comparisons` rows a rebuild restores from the arms' run.json links.
 */
@Injectable()
export class RunIndexRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Insert or overwrite every column: the run folder is the source of truth. */
  async upsert(data: RunIndexData): Promise<RunIndexRow> {
    return this.prisma.runIndexEntry.upsert({ where: { id: data.id }, create: data, update: data });
  }

  /**
   * Restores one `comparisons` row from its two run folders (SPEC 0003 section 5.3: files win). The
   * columns the run files hold are overwritten; `title` and `created_by`, which they do not hold,
   * are kept on an existing row and taken from the derived values only for a lost row.
   */
  async upsertComparison(data: ComparisonIndexData): Promise<void> {
    await this.prisma.comparison.upsert({
      where: { id: data.id },
      create: data,
      update: {
        createdAt: data.createdAt,
        subjectJson: data.subjectJson,
        briefHash: data.briefHash,
        runAId: data.runAId,
        runBId: data.runBId,
        startedAt: data.startedAt,
      },
    });
  }

  /** At most `limit` ids, for the orphan check of a rebuild. */
  async listIds(limit: number): Promise<string[]> {
    const rows = await this.prisma.runIndexEntry.findMany({ select: { id: true }, orderBy: { id: 'asc' }, take: limit });
    return rows.map((row) => row.id);
  }

  async page(statuses: readonly RunStatus[] | null, page: RunIndexKeysetPage): Promise<RunIndexRowPage> {
    const where: Prisma.RunIndexEntryWhereInput = statuses === null ? {} : { status: { in: [...statuses] } };
    const pageWhere: Prisma.RunIndexEntryWhereInput =
      page.beforeRunId === null ? where : { AND: [where, { id: { lt: page.beforeRunId } }] };
    const [rows, total] = await Promise.all([
      this.prisma.runIndexEntry.findMany({ where: pageWhere, orderBy: { id: 'desc' }, take: page.limit + 1 }),
      this.prisma.runIndexEntry.count({ where }),
    ]);
    return { rows: rows.slice(0, page.limit), total, hasMore: rows.length > page.limit };
  }
}
