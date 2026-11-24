import { type AssetJobFile, type ReferenceAnalysisJobFile, type VoiceSampleJobFile } from '@studio/shared/asset-jobs';
import { type AssetJobLocation } from '@studio/shared/asset-jobs/files';
import { type AssetJobEnding } from './asset-job-file.mapper';
import { type AssetJobSignals } from './asset-job-signals';

/** A job this process claimed: the `running` file it wrote and confirmed, and where it lives. */
export interface ClaimedAssetJob<File extends AssetJobFile = AssetJobFile> {
  location: AssetJobLocation;
  file: File;
}

/**
 * Runs one claimed job to its ending; writes only the job's own result files (never `job.json`,
 * which the step writes). Throws on an unexpected error or a fired signal; the step names the
 * ending then.
 */
export interface AssetJobHandler<File extends AssetJobFile> {
  handle(job: ClaimedAssetJob<File>, signals: AssetJobSignals): Promise<AssetJobEnding>;
}

export type VoiceSampleHandlerPort = AssetJobHandler<VoiceSampleJobFile>;
export type ReferenceAnalysisHandlerPort = AssetJobHandler<ReferenceAnalysisJobFile>;
