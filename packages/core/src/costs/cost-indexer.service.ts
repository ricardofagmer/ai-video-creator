import { basename } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AssetJobKindSchema, type AssetJobKind } from '@studio/shared/asset-jobs';
import { readAssetJobCost } from '@studio/shared/asset-jobs/files';
import { AssetRefSchema, type AssetRef } from '@studio/shared/catalog';
import { CurationIdSchema, type CurationId } from '@studio/shared/curation';
import { readCurationCost } from '@studio/shared/curation/files';
import { readCostFile } from '@studio/shared/run-files';
import { RunIdSchema, type RunId } from '@studio/shared/run-format';
import { DataHome } from '../paths/data-home';
import { PrismaService } from '../prisma/prisma.service';
import { assetJobCostSessionKey, toAssetJobCostEntryData } from './asset-job-cost.mapper';
import { CostEntryRepository, isUniqueConstraintError } from './cost-entry.repository';
import { costSessionKey, costSessionKeyText, toCostEntryData, type CostSessionKey } from './cost-session.mapper';
import { AssetJobCostFileMismatchError, CostFileCurationMismatchError, CostFileRunMismatchError } from './costs.errors';
import { curationCostSessionKey, toCurationCostEntryData } from './curation-cost.mapper';

export interface IndexRunCostInput {
  runId: string;
  /** Absolute run folder (`runDirectory(dataHome.runs, runId)`). */
  runDir: string;
}

export type IndexRunCostResult =
  | { status: 'no-cost-file'; runId: RunId }
  | { status: 'indexed'; runId: RunId; inserted: number; alreadyIndexed: number };

export interface IndexCurationCostInput {
  /** Validated as a ULID; the folder is always `dataHome.curations/<curationId>`, never a caller path. */
  curationId: string;
}

export type IndexCurationCostResult =
  | { status: 'no-cost-file'; curationId: CurationId }
  | { status: 'indexed'; curationId: CurationId; inserted: number; alreadyIndexed: number };

export interface IndexAssetJobCostInput {
  /** Validated; the folder is always `dataHome.assetJobs/<kind>/<ref>`, never a caller path. */
  kind: string;
  ref: string;
}

export type IndexAssetJobCostResult =
  | { status: 'no-cost-file'; kind: AssetJobKind; ref: AssetRef }
  | { status: 'indexed'; kind: AssetJobKind; ref: AssetRef; inserted: number; alreadyIndexed: number };

interface IndexCounts {
  inserted: number;
  alreadyIndexed: number;
}

/** One file's sessions as `cost_entries` rows, keyed for the idempotent insert. */
interface IndexableSession {
  key: CostSessionKey;
  data: Prisma.CostEntryCreateManyInput;
}

/**
 * Copies a run's cost.json sessions into `cost_entries` (SPEC 0002 rev 2). Idempotent: the key
 * (runId, sessionId, callIndex) is C8's unique index, rows already present are skipped, and a
 * second run of the same index inserts nothing. Runs only in the api and the CLI, through
 * `IndexRunCostCommand`; the watcher never writes SQLite (ADR 0003).
 */
@Injectable()
export class CostIndexer {
  private readonly logger = new Logger(CostIndexer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: CostEntryRepository,
    private readonly dataHome: DataHome,
  ) {}

  async indexRun(input: IndexRunCostInput): Promise<IndexRunCostResult> {
    const runId = RunIdSchema.parse(input.runId);
    if (basename(input.runDir) !== runId) throw new CostFileRunMismatchError(runId, basename(input.runDir));
    const cost = await readCostFile(input.runDir);
    if (cost.status === 'absent') return { status: 'no-cost-file', runId };
    if (cost.value.runId !== runId) throw new CostFileRunMismatchError(runId, cost.value.runId);
    const file = cost.value;
    const counts = await this.insertMissing(
      runId,
      file.sessions.map((session) => ({ key: costSessionKey(session), data: toCostEntryData(runId, file.priceTableVersion, session) })),
    );
    this.logger.log({ event: 'cost.run-indexed', runId, inserted: counts.inserted, alreadyIndexed: counts.alreadyIndexed });
    return { status: 'indexed', runId, ...counts };
  }

  /**
   * Copies a curation's cost.json sessions into `cost_entries` with `source_kind = 'curation'`
   * (SPEC 0005 section 5.7, B1, B16): `run_id` holds the curation id, so the run key
   * (runId, sessionId, callIndex) dedupes it the same way. Idempotent; api and CLI only.
   */
  async indexCuration(input: IndexCurationCostInput): Promise<IndexCurationCostResult> {
    const curationId = CurationIdSchema.parse(input.curationId);
    const cost = await readCurationCost({ curationsRoot: this.dataHome.curations, curationId });
    if (cost.status === 'absent') return { status: 'no-cost-file', curationId };
    if (cost.value.curationId !== curationId) throw new CostFileCurationMismatchError(curationId, cost.value.curationId);
    const file = cost.value;
    const counts = await this.insertMissing(
      curationId,
      file.sessions.map((session) => ({
        key: curationCostSessionKey(session),
        data: toCurationCostEntryData(curationId, file.priceTableVersion, session),
      })),
    );
    this.logger.log({ event: 'cost.curation-indexed', curationId, inserted: counts.inserted, alreadyIndexed: counts.alreadyIndexed });
    return { status: 'indexed', curationId, ...counts };
  }

  /**
   * Copies an asset job's cost.json sessions into `cost_entries` with `source_kind = 'asset-job'`
   * (spec Amendment 3): `run_id` holds the job ref and `step_key` is `asset-job:<kind>`, so the run
   * key (runId, sessionId, callIndex) dedupes it. Idempotent; api and CLI only.
   */
  async indexAssetJob(input: IndexAssetJobCostInput): Promise<IndexAssetJobCostResult> {
    const kind = AssetJobKindSchema.parse(input.kind);
    const ref = AssetRefSchema.parse(input.ref);
    const cost = await readAssetJobCost({ assetJobsRoot: this.dataHome.assetJobs, kind, ref });
    if (cost.status === 'absent') return { status: 'no-cost-file', kind, ref };
    if (cost.value.ref !== ref || cost.value.kind !== kind) throw new AssetJobCostFileMismatchError(kind, ref);
    const file = cost.value;
    const counts = await this.insertMissing(
      ref,
      file.sessions.map((session) => ({
        key: assetJobCostSessionKey(session),
        data: toAssetJobCostEntryData({ kind, ref }, session),
      })),
    );
    this.logger.log({ event: 'cost.asset-job-indexed', kind, ref, inserted: counts.inserted, alreadyIndexed: counts.alreadyIndexed });
    return { status: 'indexed', kind, ref, ...counts };
  }

  /** Inserts the sessions whose key is not indexed yet, in one transaction; a concurrent writer reruns once. */
  private async insertMissing(sourceId: string, sessions: readonly IndexableSession[]): Promise<IndexCounts> {
    const attempt = (): Promise<IndexCounts> =>
      this.prisma.$transaction(async (transaction) => {
        const indexed = await this.entries.findRunKeys(sourceId, transaction);
        const seen = new Set<string>();
        const missing = sessions.filter((session) => {
          const key = costSessionKeyText(sourceId, session.key);
          if (indexed.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const inserted = await this.entries.insertMany(
          missing.map((session) => session.data),
          transaction,
        );
        return { inserted, alreadyIndexed: sessions.length - missing.length };
      });

    try {
      return await attempt();
    } catch (error) {
      // The api and the CLI indexed the same folder at once; the rerun sees the other writer's rows.
      if (!isUniqueConstraintError(error)) throw error;
      return attempt();
    }
  }
}
