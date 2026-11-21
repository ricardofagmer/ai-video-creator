import { type AssetKind, type Provenance } from '@studio/shared/catalog';
import { type AssetVersionMetadataInput, type NewAssetContentInput } from '../catalog';
import { type SeedOrigin } from './seed-manifest.schema';

/**
 * Content sources the seed uses. `import-*` and `inline` copy into the content-addressed store;
 * `reference-file` hashes in place and copies nothing (biometric voice samples).
 */
export type SeedContentInput = Extract<NewAssetContentInput, { source: 'import-folder' | 'import-file' | 'reference-file' | 'inline' }>;

/** Everything needed to register one asset version through the catalog commands. */
export interface SeedAssetPlan {
  assetId: string;
  kind: AssetKind;
  metadata: AssetVersionMetadataInput;
  content: SeedContentInput;
}

/**
 * One seed entry, planned lazily: reading its definition files can fail, and that failure must
 * stay with this entry instead of stopping the whole seed.
 */
export interface SeedAssetUnit {
  entryId: string;
  plan(): Promise<SeedAssetPlan>;
}

export function seedProvenance(origin: SeedOrigin, author: string): Provenance {
  // C1 seed provenance names only the two absorbed sources; a studio-authored asset was made here.
  if (origin === 'studio') return { source: { type: 'created-here' }, author, capturedAt: null };
  return { source: { type: 'seed', origin }, author, capturedAt: null };
}

/** Shortens free text to a C1 length limit at a word boundary. */
export function truncateText(text: string, maxLength: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  const cut = singleLine.slice(0, maxLength - 3);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut}...`;
}
