import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { IndexAssetJobCostCommand } from '@studio/core/costs';
import { isTerminalAssetJobStatus, type ReferenceAnalysisJobFile, type VoiceSampleJobFile } from '@studio/shared/asset-jobs';

/** The facts of a job the index needs; both job kinds satisfy it. */
export type IndexableAssetJob = Pick<VoiceSampleJobFile | ReferenceAnalysisJobFile, 'kind' | 'ref' | 'status'>;

/**
 * Mirrors a settled asset job's `cost.json` into `cost_entries` with `source_kind = 'asset-job'`
 * (guided-creation spec Amendment 3), the asset-job counterpart of `CurationCostIndexSync`: the
 * watcher never writes SQLite, so the api indexes what it observes. Only a terminal job is indexed,
 * because the watcher no longer writes its cost file then. The command is idempotent, so repeated
 * polls insert nothing; a failure is logged by kind, ref and error name and never fails the request
 * that observed the job (the month spend also counts sessions not indexed yet).
 */
@Injectable()
export class AssetJobCostIndexSync {
  private readonly logger = new Logger(AssetJobCostIndexSync.name);

  constructor(private readonly commandBus: CommandBus) {}

  async indexIfTerminal(job: IndexableAssetJob): Promise<void> {
    if (!isTerminalAssetJobStatus(job.status)) return;
    try {
      await this.commandBus.execute(new IndexAssetJobCostCommand({ kind: job.kind, ref: job.ref }));
    } catch (error) {
      this.logger.warn({ event: 'costs.asset-job-index-failed', kind: job.kind, ref: job.ref, error: errorName(error) });
    }
  }
}

/** Error names only: these logs never need the message. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
