import { Injectable, Logger } from '@nestjs/common';
import {
  type AssetJobFile,
  type AssetJobKind,
  type AssetPurposeJobFile,
  type ReferenceAnalysisJobFile,
  type TemplatePreviewJobFile,
  type VoiceSampleJobFile,
} from '@studio/shared/asset-jobs';
import {
  listAssetJobRefs,
  readAssetJobState,
  removeAssetJobSamples,
  writeRequestedAssetJob,
  type AssetJobLocation,
} from '@studio/shared/asset-jobs/files';
import { type AssetRef } from '@studio/shared/catalog';
import { RunFileError } from '@studio/shared/run-files';
import { DataHome } from '../paths/data-home';
import { AssetJobFileCorruptError } from './asset-jobs.errors';

/** A version's job of one kind: `none` until the first request. */
export type AssetJobLookup<Job> = { status: 'none' } | { status: 'present'; job: Job };

/** Job files narrowed by kind, so a folder can never hand back the other kind's file. */
export interface AssetJobFileOf {
  'voice-sample': VoiceSampleJobFile;
  'reference-analysis': ReferenceAnalysisJobFile;
  'template-preview': TemplatePreviewJobFile;
  'asset-purpose': AssetPurposeJobFile;
}

function isJobOfKind<Kind extends AssetJobKind>(file: AssetJobFile, kind: Kind): file is AssetJobFile & AssetJobFileOf[Kind] {
  return file.kind === kind;
}

/**
 * The `asset-jobs/` folders of the data home, through the shared file helpers that refuse any path
 * outside `asset-jobs/<kind>/<assetId>@<version>/`. The files are the only source of truth of a
 * job's status and of the queue. Read-only, except the api's request write and the removal of
 * kept voice sample clips.
 */
@Injectable()
export class AssetJobStore {
  private readonly logger = new Logger(AssetJobStore.name);

  constructor(private readonly dataHome: DataHome) {}

  location(kind: AssetJobKind, ref: AssetRef): AssetJobLocation {
    return { assetJobsRoot: this.dataHome.assetJobs, kind, ref };
  }

  /** `job.json` of the version, or `none`. A corrupt file is a typed error. */
  async read<Kind extends AssetJobKind>(kind: Kind, ref: AssetRef): Promise<AssetJobLookup<AssetJobFileOf[Kind]>> {
    let state: Awaited<ReturnType<typeof readAssetJobState>>;
    try {
      state = await readAssetJobState(this.location(kind, ref));
    } catch (error) {
      if (error instanceof RunFileError) throw new AssetJobFileCorruptError(kind, ref);
      throw error;
    }
    if (state.status === 'absent') return { status: 'none' };
    // readAssetJobState already refuses a file whose kind differs from its folder.
    if (!isJobOfKind(state.value, kind)) throw new AssetJobFileCorruptError(kind, ref);
    return { status: 'present', job: state.value };
  }

  /**
   * Jobs of this kind still waiting for the watcher. Unreadable folders are skipped and logged by
   * ref: one bad file must not block every other request.
   */
  async countRequested(kind: AssetJobKind): Promise<number> {
    let requested = 0;
    for (const ref of await listAssetJobRefs(this.dataHome.assetJobs, kind)) {
      try {
        const lookup = await this.read(kind, ref);
        if (lookup.status === 'present' && lookup.job.status === 'requested') requested += 1;
      } catch (error) {
        if (!(error instanceof AssetJobFileCorruptError)) throw error;
        this.logger.warn({ event: 'asset-job.queue-skipped', kind, ref, errorName: error.name });
      }
    }
    return requested;
  }

  /** The api's one write per request (`AssetJobOpenError` when the watcher still owns the job). */
  writeRequested(file: AssetJobFile): Promise<void> {
    return writeRequestedAssetJob(this.location(file.kind, file.ref), file);
  }

  /** Deletes the kept clips of a voice sample; missing clips are fine. */
  removeSamples(ref: AssetRef): Promise<void> {
    return removeAssetJobSamples(this.location('voice-sample', ref));
  }
}
