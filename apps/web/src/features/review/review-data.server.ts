import 'server-only';
import { type RunStateResponse } from '@studio/shared/api';
import {
  CostFileSchema,
  QaSummarySchema,
  RunIdSchema,
  RunManifestSchema,
  type CostFile,
  type QaSummary,
  type RunManifest,
} from '@studio/shared/run-format';
import { hasReview } from '@/features/runs/run-labels';
import { serverRunsApi } from '@/features/runs/runs-api.server';
import { ApiResponseContractError, isNotFound } from '@/lib/api';
import { videoAccessOf, type ArtifactRead, type VideoAccess } from './media-safety';

export type ReviewPageData =
  | { kind: 'missing' }
  | { kind: 'not-ready'; state: RunStateResponse }
  | {
      kind: 'ready';
      state: RunStateResponse;
      manifest: ArtifactRead<RunManifest>;
      cost: ArtifactRead<CostFile>;
      qa: ArtifactRead<QaSummary>;
      video: VideoAccess;
    };

async function readArtifact<Value>(read: () => Promise<Value>): Promise<ArtifactRead<Value>> {
  try {
    return { status: 'present', value: await read() };
  } catch (error) {
    if (isNotFound(error)) return { status: 'absent' };
    if (error instanceof ApiResponseContractError) return { status: 'unreadable' };
    throw error;
  }
}

/**
 * Everything the review screen (design/telas/09) shows, read on the server. Whether the video
 * plays comes from the api's `artifactAccess` (SPEC 0002 rev 4, section 13.5): the web makes no
 * catalog sensitivity lookup of its own. The JSON artifacts are served for every access value.
 */
export async function loadReviewData(runId: string): Promise<ReviewPageData> {
  if (!RunIdSchema.safeParse(runId).success) return { kind: 'missing' };
  const runs = serverRunsApi();
  let state: RunStateResponse;
  try {
    state = await runs.getRunState(runId);
  } catch (error) {
    if (isNotFound(error)) return { kind: 'missing' };
    throw error;
  }
  if (!hasReview(state.run.state)) return { kind: 'not-ready', state };

  const [manifest, cost, qa] = await Promise.all([
    readArtifact(() => runs.readArtifactJson(runId, 'manifest.json', RunManifestSchema)),
    readArtifact(() => runs.readArtifactJson(runId, 'cost.json', CostFileSchema)),
    readArtifact(() => runs.readArtifactJson(runId, 'qa/summary.json', QaSummarySchema)),
  ]);
  return { kind: 'ready', state, manifest, cost, qa, video: videoAccessOf(state.artifactAccess, state.run, manifest) };
}
