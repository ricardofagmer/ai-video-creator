import { Injectable } from '@nestjs/common';
import { type Comparison as ComparisonRow, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toComparisonRecord, type ComparisonRecord, type NewComparisonRow } from './comparison-record.mapper';

export interface ComparisonKeysetPage {
  /** Comparison id (a ULID, so time-ordered) the page starts after, newest first; null for the first page. */
  beforeId: string | null;
  limit: number;
}

export interface ComparisonRowPage {
  rows: ComparisonRow[];
  total: number;
  hasMore: boolean;
}

/**
 * Data access for the `comparisons` index (SPEC 0003 section 4.4), plus the one read of reviewed
 * run costs the estimate shows. Writes run in the api and the CLI only (ADR 0003); the run index
 * rebuild restores lost rows from the run folders.
 */
@Injectable()
export class ComparisonRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(row: NewComparisonRow): Promise<void> {
    await this.prisma.comparison.create({ data: { ...row, startedAt: null } });
  }

  /** Sets `started_at` once; a repeated start leaves the first time. */
  async markStarted(id: string, startedAt: Date): Promise<void> {
    await this.prisma.comparison.updateMany({ where: { id, startedAt: null }, data: { startedAt } });
  }

  async findRecord(id: string): Promise<ComparisonRecord | null> {
    const row = await this.prisma.comparison.findUnique({ where: { id } });
    return row === null ? null : toComparisonRecord(row);
  }

  async page(page: ComparisonKeysetPage): Promise<ComparisonRowPage> {
    const where: Prisma.ComparisonWhereInput = page.beforeId === null ? {} : { id: { lt: page.beforeId } };
    const [rows, total] = await Promise.all([
      this.prisma.comparison.findMany({ where, orderBy: { id: 'desc' }, take: page.limit + 1 }),
      this.prisma.comparison.count(),
    ]);
    return { rows: rows.slice(0, page.limit), total, hasMore: rows.length > page.limit };
  }

  /**
   * `expectedPairUsd` input (section 5.3): `cost_usd` of the last `take` runs of the recipe id that
   * have a final review (an outcome row) and cost more than $0, newest first. Display only.
   */
  async recentReviewedPaidRunCosts(recipeId: string, take: number): Promise<number[]> {
    const rows = await this.prisma.runIndexEntry.findMany({
      where: { recipeId, costUsd: { gt: 0 }, outcome: { isNot: null } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { costUsd: true },
    });
    return rows.map((row) => row.costUsd);
  }
}
