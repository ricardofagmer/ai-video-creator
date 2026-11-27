import 'server-only';
import { PRESET_VIDEO_TAG } from '@studio/shared/api';
import { serverRunsApi } from '@/features/runs/runs-api.server';
import { ApiRequestError, ApiResponseContractError, ApiUnreachableError } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';

export interface PresetVideo {
  assetId: string;
  version: number;
  name: string;
  runId: string;
  /** The preset version the run used, `recipeId@version`. */
  recipeRef: string;
  createdAt: string;
}

export type PresetVideosResult = { status: 'ready'; videos: PresetVideo[] } | { status: 'failed' };

const PAGE_LIMIT = 100;

/**
 * The run videos saved for a preset: catalog assets tagged `preset-video` whose provenance run used
 * any version of this preset. Runs are read from the index to learn each run's preset version.
 */
export async function loadPresetVideos(recipeId: string): Promise<PresetVideosResult> {
  try {
    const [assets, runs] = await Promise.all([
      serverStudioClient().searchAssets({ kinds: ['reference'], tags: [PRESET_VIDEO_TAG], sensitivity: 'exclude-biometric', sort: 'recent', limit: PAGE_LIMIT }),
      serverRunsApi().listRuns({ statuses: ['review', 'approved', 'rejected'], limit: PAGE_LIMIT }),
    ]);
    const recipeRefByRun = new Map(runs.items.map((run) => [run.runId, run.recipe.ref]));
    const videos = assets.items.flatMap((asset): PresetVideo[] => {
      const source = asset.provenance?.source;
      if (source?.type !== 'run') return [];
      const recipeRef = recipeRefByRun.get(source.runId);
      if (recipeRef === undefined || !recipeRef.startsWith(`${recipeId}@`)) return [];
      return [{ assetId: asset.id, version: asset.version, name: asset.name, runId: source.runId, recipeRef, createdAt: asset.createdAt }];
    });
    return { status: 'ready', videos };
  } catch (error) {
    // The preset editor still works without this list; other errors (a login redirect) propagate.
    if (error instanceof ApiRequestError || error instanceof ApiUnreachableError || error instanceof ApiResponseContractError) {
      return { status: 'failed' };
    }
    throw error;
  }
}
