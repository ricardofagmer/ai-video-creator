import { type Prisma } from '@prisma/client';
import { AssetKindSchema, AssetVersionSchema, formatAssetRef, type AssetKind, type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { CatalogRowCorruptError } from './catalog.errors';

/** Every version query includes the asset's kind, which lives on the `assets` row. */
const versionWithKind = { asset: { select: { kind: true } } } satisfies Prisma.AssetVersionInclude;

/**
 * The default read projection never loads the vector (SPEC 0003 L8, R2-AC-10): only the search scan
 * of the embeddings module selects `embedding_json`, so no view, list or agent read carries one. The
 * small bookkeeping columns (`embeddingModel`, `embeddingInputHash`, `embeddedAt`) stay on the row so
 * the index state of a version can be derived without loading its vector.
 */
const versionWithoutVector = { embeddingJson: true } as const satisfies Prisma.AssetVersionOmit;

/** The default read projection of every catalog query and write that returns a row. */
export const versionReadProjection = { include: versionWithKind, omit: versionWithoutVector } as const satisfies {
  include: Prisma.AssetVersionInclude;
  omit: Prisma.AssetVersionOmit;
};
export type AssetVersionRow = Prisma.AssetVersionGetPayload<typeof versionReadProjection>;

function parseJsonColumn(text: string, ref: AssetRef): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new CatalogRowCorruptError(ref, { cause: error });
  }
}

function toSafeNumber(value: bigint, ref: AssetRef): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) throw new CatalogRowCorruptError(ref);
  return converted;
}

/** Kind column of an `assets` row, re-validated against C1. */
export function toAssetKind(asset: { id: string; kind: string }): AssetKind {
  const parsed = AssetKindSchema.safeParse(asset.kind);
  if (!parsed.success) throw new CatalogRowCorruptError(asset.id);
  return parsed.data;
}

/** Row to C1 version; the whole result is re-validated so a bad row never leaves the module. */
export function toAssetVersion(row: AssetVersionRow): AssetVersion {
  const ref = formatAssetRef({ assetId: row.assetId, version: row.version });
  const candidate: Record<string, unknown> = {
    id: row.assetId,
    kind: row.asset.kind,
    name: row.name,
    summary: row.summary,
    version: row.version,
    status: row.status,
    tags: parseJsonColumn(row.tagsJson, ref),
    owner: row.owner,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    contentHash: row.contentHash,
    sizeBytes: toSafeNumber(row.sizeBytes, ref),
    mimeType: row.mimeType,
    layout: row.layout,
    storage: row.storageMode === 'reference' ? { mode: 'reference', absolutePath: row.referencePath } : { mode: row.storageMode },
    provenance: row.provenanceJson === null ? null : parseJsonColumn(row.provenanceJson, ref),
    license: row.licenseJson === null ? null : parseJsonColumn(row.licenseJson, ref),
    sensitivity: row.sensitivity,
    usageCount: row.usageCount,
    qualityScore: row.qualityScore,
    qualitySampleSize: row.qualitySampleSize,
    qualityPlatformSampleSize: row.qualityPlatformSampleSize,
    qualityScoredAt: row.qualityScoredAt === null ? null : row.qualityScoredAt.toISOString(),
    notes: row.notes,
    purpose: row.purpose,
    purposeSource: row.purposeSource,
    details: parseJsonColumn(row.detailsJson, ref),
  };
  const parsed = AssetVersionSchema.safeParse(candidate);
  if (!parsed.success) throw new CatalogRowCorruptError(ref);
  return parsed.data;
}

/**
 * C1 version to insert data; `id`/`version` pair is unique, so N is never overwritten. The vector
 * columns are left to their null defaults: only the embeddings indexer (R2-03) writes them.
 */
export function toCreateData(version: AssetVersion): Prisma.AssetVersionUncheckedCreateInput {
  return {
    assetId: version.id,
    version: version.version,
    name: version.name,
    summary: version.summary,
    status: version.status,
    tagsJson: JSON.stringify(version.tags),
    owner: version.owner,
    contentHash: version.contentHash,
    sizeBytes: BigInt(version.sizeBytes),
    mimeType: version.mimeType,
    layout: version.layout,
    storageMode: version.storage.mode,
    referencePath: version.storage.mode === 'reference' ? version.storage.absolutePath : null,
    provenanceJson: version.provenance === null ? null : JSON.stringify(version.provenance),
    licenseJson: version.license === null ? null : JSON.stringify(version.license),
    sensitivity: version.sensitivity,
    detailsJson: JSON.stringify(version.details),
    usageCount: version.usageCount,
    qualityScore: version.qualityScore,
    qualitySampleSize: version.qualitySampleSize,
    qualityPlatformSampleSize: version.qualityPlatformSampleSize,
    qualityScoredAt: version.qualityScoredAt === null ? null : new Date(version.qualityScoredAt),
    notes: version.notes,
    purpose: version.purpose,
    purposeSource: version.purposeSource,
    createdAt: new Date(version.createdAt),
    updatedAt: new Date(version.updatedAt),
  };
}
