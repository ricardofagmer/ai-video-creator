import { Query } from '@nestjs/cqrs';
import { type AssetPurposeJobView } from '@studio/shared/api';
import { type AssetVersion } from '@studio/shared/catalog';

/** One version after the purpose copy, and its open or failed purpose job (C-P2 `purposeJob`). */
export interface AssetPurposeState {
  version: AssetVersion;
  purposeJob: AssetPurposeJobView | null;
}

/**
 * ADR 0012 (AP-02, C-P2): the api's list, detail and get reads pass their versions through this
 * query before building views. A `done` job's text is copied into its row unless the owner wrote
 * the purpose; the answer keeps the order of `versions`, one state per version.
 */
export class GetAssetPurposeStatesQuery extends Query<AssetPurposeState[]> {
  constructor(readonly versions: readonly AssetVersion[]) {
    super();
  }
}
