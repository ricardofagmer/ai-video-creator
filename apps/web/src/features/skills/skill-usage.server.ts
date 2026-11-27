import 'server-only';
import { API_MAX_PAGE_LIMIT } from '@studio/shared/api';
import { parseAssetRef } from '@studio/shared/catalog';
import { createRunsApi } from '@/features/runs/runs-api';
import { serverStudioClient, serverTransport } from '@/lib/api/server';

/** Distinct recipe versions read per page load; runs of recipes past this are left out of the count. */
const RECIPE_LOOKUPS_MAX = 20;

/** Studio runs whose recipe bound an asset, among the most recent ones. */
export interface AssetRunUsage {
  runCount: number;
  latest: { runId: string; title: string };
}

function recipeVersionOf(ref: string): { recipeId: string; version: number } {
  const separator = ref.lastIndexOf('@');
  return { recipeId: ref.slice(0, separator), version: Number.parseInt(ref.slice(separator + 1), 10) };
}

/**
 * Run usage per bound asset id, from the newest runs (one page) and the recipe version each one
 * pinned. The usage line is an extra on the Skills cards, so a failed read returns null and the
 * cards simply leave it out; an expired session is the skill list's own redirect.
 */
export async function loadRecentRunUsage(): Promise<ReadonlyMap<string, AssetRunUsage> | null> {
  try {
    const page = await createRunsApi(serverTransport('throw')).listRuns({ limit: API_MAX_PAGE_LIMIT });
    const recipeRefs = [...new Set(page.items.map((run) => run.recipe.ref))].slice(0, RECIPE_LOOKUPS_MAX);
    const client = serverStudioClient('throw');
    const boundAssets = new Map<string, readonly string[]>();
    await Promise.all(
      recipeRefs.map(async (ref) => {
        const { recipeId, version } = recipeVersionOf(ref);
        const view = await client.getRecipeVersion(recipeId, version);
        boundAssets.set(ref, [...new Set(view.recipe.bindings.map((binding) => parseAssetRef(binding.ref).assetId))]);
      }),
    );
    const usage = new Map<string, AssetRunUsage>();
    // Runs come newest first, so the first run seen for an asset is its latest.
    for (const run of page.items) {
      for (const assetId of boundAssets.get(run.recipe.ref) ?? []) {
        const current = usage.get(assetId);
        usage.set(assetId, {
          runCount: (current?.runCount ?? 0) + 1,
          latest: current?.latest ?? { runId: run.runId, title: run.title },
        });
      }
    }
    return usage;
  } catch {
    return null;
  }
}
