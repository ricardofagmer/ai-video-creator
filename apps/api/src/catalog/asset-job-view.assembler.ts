import { Injectable } from '@nestjs/common';
import { type AssetJobLookup, type ReferenceAnalysisState } from '@studio/core/asset-jobs';
import { type ReferenceAnalysisView, type VoiceSampleView } from '@studio/shared/api';
import { type ReferenceAnalysisJobFile, type VoiceSampleJobFile } from '@studio/shared/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
import { AssetJobCostIndexSync } from './asset-job-cost-index.service';

/** The fields every asset job view shares. */
type JobViewBase = Pick<VoiceSampleView, 'ref' | 'status' | 'mode' | 'errorCode' | 'updatedAt'>;

function noJobFields(ref: AssetRef): JobViewBase {
  return { ref, status: 'none', mode: null, errorCode: null, updatedAt: null };
}

function jobFields(job: VoiceSampleJobFile | ReferenceAnalysisJobFile): JobViewBase {
  return { ref: job.ref, status: job.status, mode: job.mode ?? null, errorCode: job.error?.code ?? null, updatedAt: job.updatedAt };
}

/**
 * Answers of the asset job routes (guided-creation design sections 2 and 4). Each field is picked
 * from the job file, never spread, so a view can never carry a path, a provider's text or the
 * sample sentence. A terminal job has its cost indexed first, so the cost pages see it on the next
 * read; the index never fails the answer.
 */
@Injectable()
export class AssetJobViewAssembler {
  constructor(private readonly costIndex: AssetJobCostIndexSync) {}

  /** `ref` names the version asked for, used when it never had a job. */
  async voiceSample(ref: AssetRef, lookup: AssetJobLookup<VoiceSampleJobFile>): Promise<VoiceSampleView> {
    if (lookup.status === 'none') return { ...noJobFields(ref), language: null, engine: null, audio: null };
    const { job } = lookup;
    await this.costIndex.indexIfTerminal(job);
    return {
      ...jobFields(job),
      language: job.language,
      engine: job.engine ?? null,
      // Only a done job has a clip the audio route serves; core drops `audio` when the clip is gone.
      audio: job.status === 'done' ? (job.audio ?? null) : null,
    };
  }

  async referenceAnalysis(ref: AssetRef, state: ReferenceAnalysisState): Promise<ReferenceAnalysisView> {
    const unavailable = state.eligibility === 'ok' ? null : state.eligibility;
    if (state.lookup.status === 'none') return { ...noJobFields(ref), unavailable, frames: null, analysis: null };
    const { job } = state.lookup;
    await this.costIndex.indexIfTerminal(job);
    return { ...jobFields(job), unavailable, frames: job.frames ?? null, analysis: job.analysis ?? null };
  }
}
