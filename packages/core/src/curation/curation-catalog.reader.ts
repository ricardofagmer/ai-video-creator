import { Injectable } from '@nestjs/common';
import { ProvenanceSchema, parseAssetRef, formatAssetRef, type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { type CurationId } from '@studio/shared/curation';
import { recipeRefOf, type RecipeRef } from '@studio/shared/recipes';
import { toAssetVersion, versionReadProjection } from '../catalog/asset-version.mapper';
import { PrismaService } from '../prisma';
import { parseRecipeRef } from '../recipes/recipe-ref';
import { toRecipeVersionView, type RecipeVersionView } from '../recipes/recipe-version.mapper';

/** An asset version with its row id, the key of `run_outcome_assets`. */
export interface CatalogAssetSubject {
  rowId: number;
  version: AssetVersion;
}

/** Why a recipe binding cannot be run from a saved curator draft (check `bindings-resolvable`). */
export type BindingState = 'resolvable' | 'missing' | 'biometric' | 'deprecated';

/** Drafts already saved from one curation; more than one would be a data-integrity problem. */
const MAX_DRAFT_CANDIDATES = 10;

function isCuratorProvenanceOf(provenance: unknown, curationId: CurationId): boolean {
  const parsed = ProvenanceSchema.safeParse(provenance);
  return parsed.success && parsed.data.source.type === 'curator' && parsed.data.source.curationId === curationId;
}

function parsedJsonOrNull(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    // A row whose JSON does not parse is not a curator draft; the catalog reports it on its own reads.
    return null;
  }
}

/**
 * Read-only catalog and recipe lookups of the curation module (SPEC 0005 sections 5.1, 5.3, 5.4).
 * It uses Prisma directly with the catalog and recipe read mappers, so the watcher needs no
 * catalog or recipe command module (ADR 0003: the watcher never writes SQLite).
 */
@Injectable()
export class CurationCatalogReader {
  constructor(private readonly prisma: PrismaService) {}

  async findAssetVersion(ref: AssetRef): Promise<CatalogAssetSubject | null> {
    const { assetId, version } = parseAssetRef(ref);
    const row = await this.prisma.assetVersion.findUnique({ where: { assetId_version: { assetId, version } }, ...versionReadProjection });
    return row === null ? null : { rowId: row.id, version: toAssetVersion(row) };
  }

  async findRecipeVersion(ref: RecipeRef): Promise<RecipeVersionView | null> {
    const { recipeId, version } = parseRecipeRef(ref);
    const row = await this.prisma.recipeVersion.findUnique({ where: { recipeId_version: { recipeId, version } } });
    return row === null ? null : toRecipeVersionView(row);
  }

  /** Quality score of the asset's promoted version, the packet `baselineScore` of a draft subject. */
  async promotedVersionScore(assetId: string): Promise<number | null> {
    const row = await this.prisma.assetVersion.findFirst({ where: { assetId, status: 'active' }, select: { qualityScore: true } });
    return row?.qualityScore ?? null;
  }

  /** The state of each bound asset version, keyed by ref; an unknown ref is `missing`. */
  async bindingStates(refs: readonly AssetRef[]): Promise<Map<AssetRef, BindingState>> {
    const distinct = [...new Set(refs)];
    const states = new Map<AssetRef, BindingState>(distinct.map((ref) => [ref, 'missing']));
    if (distinct.length === 0) return states;
    const rows = await this.prisma.assetVersion.findMany({
      where: { OR: distinct.map((ref) => parseAssetRef(ref)) },
      select: { assetId: true, version: true, status: true, sensitivity: true },
    });
    for (const row of rows) {
      const state: BindingState = row.sensitivity === 'biometric' ? 'biometric' : row.status === 'deprecated' ? 'deprecated' : 'resolvable';
      states.set(formatAssetRef({ assetId: row.assetId, version: row.version }), state);
    }
    return states;
  }

  /** The asset version already saved from this curation, so a repeated save writes only the row. */
  async findCuratorAssetDraft(assetId: string, curationId: CurationId): Promise<AssetRef | null> {
    // A ULID is [0-9A-Z] only, so it carries no LIKE wildcard; the JSON is parsed before trusting it.
    const rows = await this.prisma.assetVersion.findMany({
      where: { assetId, provenanceJson: { contains: curationId } },
      select: { assetId: true, version: true, provenanceJson: true },
      orderBy: { version: 'asc' },
      take: MAX_DRAFT_CANDIDATES,
    });
    const match = rows.find((row) => row.provenanceJson !== null && isCuratorProvenanceOf(parsedJsonOrNull(row.provenanceJson), curationId));
    return match === undefined ? null : formatAssetRef({ assetId: match.assetId, version: match.version });
  }

  /** The recipe version already saved from this curation (its definition holds the provenance). */
  async findCuratorRecipeDraft(recipeId: string, curationId: CurationId): Promise<RecipeRef | null> {
    const rows = await this.prisma.recipeVersion.findMany({
      where: { recipeId, definitionJson: { contains: curationId } },
      select: { recipeId: true, version: true, definitionJson: true },
      orderBy: { version: 'asc' },
      take: MAX_DRAFT_CANDIDATES,
    });
    const match = rows.find((row) => {
      const definition = parsedJsonOrNull(row.definitionJson);
      return typeof definition === 'object' && definition !== null && 'provenance' in definition && isCuratorProvenanceOf(definition.provenance, curationId);
    });
    return match === undefined ? null : recipeRefOf({ id: match.recipeId, version: match.version });
  }
}
