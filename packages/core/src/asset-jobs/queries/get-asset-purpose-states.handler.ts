import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type AssetPurposeJobFile } from '@studio/shared/asset-jobs';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { type AssetPurposeJobView } from '@studio/shared/api';
import { AssetPurposeSync } from '../../catalog/asset-purpose.sync';
import { AssetJobStore } from '../asset-job-store';
import { AssetJobFileCorruptError } from '../asset-jobs.errors';
import { GetAssetPurposeStatesQuery, type AssetPurposeState } from './get-asset-purpose-states.query';

function jobViewOf(job: AssetPurposeJobFile): AssetPurposeJobView | null {
  switch (job.status) {
    case 'requested':
    case 'running':
      return { status: job.status, errorCode: null };
    case 'failed':
    case 'refused':
      return { status: job.status, errorCode: job.error?.code ?? null };
    case 'done':
      return null;
  }
}

/**
 * ADR 0012 copy-on-read (AP-02): the watcher never writes SQLite (ADR 0003), so the api copies a
 * `done` job's text into the row here, guarded so an owner text is never replaced. A corrupt job
 * file reads as no job: the version still renders, and the log names the ref only.
 */
@QueryHandler(GetAssetPurposeStatesQuery)
export class GetAssetPurposeStatesHandler implements IQueryHandler<GetAssetPurposeStatesQuery, AssetPurposeState[]> {
  private readonly logger = new Logger(GetAssetPurposeStatesHandler.name);

  constructor(
    private readonly store: AssetJobStore,
    private readonly purposes: AssetPurposeSync,
  ) {}

  async execute(query: GetAssetPurposeStatesQuery): Promise<AssetPurposeState[]> {
    return Promise.all(query.versions.map((version) => this.stateOf(version)));
  }

  private async stateOf(version: AssetVersion): Promise<AssetPurposeState> {
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    try {
      const lookup = await this.store.read('asset-purpose', ref);
      if (lookup.status === 'none') return { version, purposeJob: null };
      const job = lookup.job;
      if (job.status === 'done' && job.purpose !== undefined) {
        return { version: await this.purposes.copyDone(version, job.purpose), purposeJob: null };
      }
      return { version, purposeJob: jobViewOf(job) };
    } catch (error) {
      if (!(error instanceof AssetJobFileCorruptError)) throw error;
      this.logger.warn({ event: 'asset-purpose.job-unreadable', ref });
      return { version, purposeJob: null };
    }
  }
}
