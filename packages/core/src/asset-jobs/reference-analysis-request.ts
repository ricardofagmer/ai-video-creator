import { type ReferenceAnalysisJobFile } from '@studio/shared/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
import { type ReferenceAnalysisEligibility } from './asset-job-policy';
import { type AssetJobDecision, type AssetJobRequest } from './asset-job-requester';
import {
  AssetJobBiometricRefusedError,
  AssetJobLinkOnlyError,
  AssetJobNotAVideoReferenceError,
  type AssetJobError,
} from './asset-jobs.errors';

/**
 * Section 4: an open or a `done` analysis is returned as it is, so asking again never bills a
 * second call for the same version (a new version has its own ref). Only `failed` and `refused`
 * are asked again.
 */
function decideReferenceAnalysis(current: ReferenceAnalysisJobFile): AssetJobDecision {
  switch (current.status) {
    case 'requested':
    case 'running':
    case 'done':
      return 'keep';
    case 'failed':
    case 'refused':
      return 'replace';
  }
}

function requestedReferenceAnalysis(ref: AssetRef, at: Date): ReferenceAnalysisJobFile {
  const now = at.toISOString();
  return { format: 1, ref, kind: 'reference-analysis', status: 'requested', requestedAt: now, updatedAt: now };
}

/** The request the command and the save-time enqueuer both write, so the two cannot drift. */
export function referenceAnalysisRequest(ref: AssetRef): AssetJobRequest<'reference-analysis'> {
  return { kind: 'reference-analysis', ref, decide: decideReferenceAnalysis, build: (at) => requestedReferenceAnalysis(ref, at) };
}

/** The 422 of a version that cannot be analysed; null when it can. */
export function referenceIneligibilityError(ref: AssetRef, eligibility: ReferenceAnalysisEligibility): AssetJobError | null {
  switch (eligibility) {
    case 'ok':
      return null;
    case 'not-a-video-reference':
      return new AssetJobNotAVideoReferenceError(ref);
    case 'link-only':
      return new AssetJobLinkOnlyError(ref);
    case 'biometric':
      return new AssetJobBiometricRefusedError(ref);
  }
}
