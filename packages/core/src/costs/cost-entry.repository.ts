import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { costSessionKeyText } from './cost-session.mapper';

type Db = Prisma.TransactionClient;

/** Run ids per `IN (...)` query; well under SQLite's bound-parameter limit. */
const RUN_IDS_PER_QUERY = 500;

/** Upper bound on indexed keys read for one month-to-date computation (10,000 sessions per run). */
export const MAX_INDEXED_KEYS_PER_QUERY = 200_000;

export class IndexedKeysLimitError extends Error {
  readonly category = 'internal';

  constructor() {
    super(`More than ${MAX_INDEXED_KEYS_PER_QUERY} indexed cost entries matched one query`);
    this.name = 'IndexedKeysLimitError';
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Data access for `cost_entries` only (C8). Read methods are the ones the watcher uses (ADR 0003:
 * it reads SQLite, never writes it); `insertMany` is called only from the api/CLI command
 * handler. Every query is parameterized by Prisma.
 */
@Injectable()
export class CostEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Keys (`runId/sessionId/callIndex`) of one run already indexed. */
  async findRunKeys(runId: string, db: Db = this.prisma): Promise<Set<string>> {
    const rows = await db.costEntry.findMany({
      where: { runId },
      select: { runId: true, sessionId: true, callIndex: true },
      take: MAX_INDEXED_KEYS_PER_QUERY + 1,
    });
    if (rows.length > MAX_INDEXED_KEYS_PER_QUERY) throw new IndexedKeysLimitError();
    return new Set(rows.map((row) => costSessionKeyText(row.runId, row)));
  }

  /** Keys already indexed for any of `runIds`, queried in bounded chunks. */
  async findKeysForRuns(runIds: readonly string[], db: Db = this.prisma): Promise<Set<string>> {
    const keys = new Set<string>();
    for (let start = 0; start < runIds.length; start += RUN_IDS_PER_QUERY) {
      const chunk = runIds.slice(start, start + RUN_IDS_PER_QUERY);
      const rows = await db.costEntry.findMany({
        where: { runId: { in: chunk } },
        select: { runId: true, sessionId: true, callIndex: true },
        take: MAX_INDEXED_KEYS_PER_QUERY + 1 - keys.size,
      });
      for (const row of rows) keys.add(costSessionKeyText(row.runId, row));
      if (keys.size > MAX_INDEXED_KEYS_PER_QUERY) throw new IndexedKeysLimitError();
    }
    return keys;
  }

  /** Sum of `usd` for entries with `start <= occurredAt < end`. */
  async sumUsdBetween(start: Date, end: Date, db: Db = this.prisma): Promise<number> {
    const result = await db.costEntry.aggregate({
      where: { occurredAt: { gte: start, lt: end } },
      _sum: { usd: true },
    });
    return result._sum.usd ?? 0;
  }

  async insertMany(data: readonly Prisma.CostEntryCreateManyInput[], db: Db): Promise<number> {
    if (data.length === 0) return 0;
    const result = await db.costEntry.createMany({ data: [...data] });
    return result.count;
  }
}
