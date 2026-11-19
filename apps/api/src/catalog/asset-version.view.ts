import { type AssetStorageView, type AssetVersionView, type LearningNoteView, type PromotionApprovalView } from '@studio/shared/api';
import { type AssetVersion } from '@studio/shared/catalog';

/** `AssetVersionView.searchIndex` (C10 rev 3). */
export type SearchIndexView = AssetVersionView['searchIndex'];

/** The rev 3 fields of one version, read beside the C1 row (SPEC 0003 section 4.3). */
export interface AssetVersionFacts {
  searchIndex: SearchIndexView;
  learnings: LearningNoteView[];
  activation: PromotionApprovalView | null;
}

/** Biometric paths never leave the api (PRD 12, criterion 22); other reference paths are the owner's own. */
function toStorageView(version: AssetVersion): AssetStorageView {
  if (version.storage.mode === 'store') return { mode: 'store' };
  return { mode: 'reference', absolutePath: version.sensitivity === 'biometric' ? null : version.storage.absolutePath };
}

/**
 * C1 version to C10 view. The vector is removed at runtime, not only by type: a spread does not
 * drop a key the view omits, and no response of any route may carry `embedding` (L8, R2-AC-10).
 */
export function toAssetVersionView(version: AssetVersion, facts: AssetVersionFacts): AssetVersionView {
  const withoutVector = { ...version };
  delete withoutVector.embedding;
  return {
    ...withoutVector,
    storage: toStorageView(version),
    searchIndex: facts.searchIndex,
    learnings: facts.learnings,
    activation: facts.activation,
  };
}
