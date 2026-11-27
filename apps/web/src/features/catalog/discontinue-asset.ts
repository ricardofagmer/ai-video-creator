import { type AssetVersionPageView, type SetAssetStatusResponse, type SetVersionStatusRequest } from '@studio/shared/api';
import { type AssetStatus } from '@studio/shared/catalog';

/**
 * The statuses a catalog list asks for when the owner picked none: an item whose versions are all
 * deprecated leaves the lists, and comes back with the status filter set to "deprecated".
 */
export const listedAssetStatuses: readonly AssetStatus[] = ['draft', 'active'];

/** The two api calls a whole-item deprecation needs; the browser client satisfies it. */
export interface DiscontinueAssetCalls {
  listAssetVersions(assetId: string, params?: { limit?: number; cursor?: string }): Promise<AssetVersionPageView>;
  setAssetStatus(assetId: string, version: number, request: SetVersionStatusRequest): Promise<SetAssetStatusResponse>;
}

const PAGE_LIMIT = 100;
/** Bound on the version pages read for one item; more versions than this is not a real case. */
const MAX_PAGES = 20;

/**
 * "Delete" of a catalog item: every version becomes `deprecated`, one status call per version. The
 * catalog never removes a row (ADR 0003), so presets and past runs that pin a version keep working.
 * A failure half way leaves the earlier versions deprecated; calling again finishes the rest, since
 * a version that is already deprecated is skipped. Returns how many versions changed.
 */
export async function discontinueAsset(calls: DiscontinueAssetCalls, assetId: string): Promise<number> {
  let changed = 0;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const versions = await calls.listAssetVersions(assetId, { limit: PAGE_LIMIT, cursor });
    for (const version of versions.items) {
      if (version.status === 'deprecated') continue;
      await calls.setAssetStatus(assetId, version.version, { status: 'deprecated' });
      changed += 1;
    }
    if (versions.nextCursor === null) break;
    cursor = versions.nextCursor;
  }
  return changed;
}
