import { Injectable, Logger } from '@nestjs/common';
import { formatAssetRef, parseAssetRef, type AssetRef } from '@studio/shared/catalog';
import { type Binding, type RecipeRef } from '@studio/shared/recipes';
import { PrismaService } from '../prisma';
import { parseRecipeRef } from '../recipes/recipe-ref';
import { toRecipeVersionView, type RecipeVersionView } from '../recipes/recipe-version.mapper';
import { RecipeRowCorruptError } from '../recipes/recipes.errors';

/** Asset versions looked up per query; keeps the SQLite bound-variable count small. */
const REFS_PER_QUERY = 200;

/** The refs that no longer resolve: a binding whose version is gone or whose hash differs, a missing reference. */
export interface UnresolvedRefs {
  bindings: AssetRef[];
  references: AssetRef[];
}

export interface ResolvableRefsQuery {
  bindings: readonly Binding[];
  references: readonly AssetRef[];
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

/**
 * Read-only recipe and catalog lookups of the schedule module (SPEC 0006 sections 5.5 step 3 and
 * 5.6 guards). Prisma reads only, with the recipe read mapper, so the watcher needs no recipe or
 * catalog command module (ADR 0003: the watcher never writes SQLite). The binding rule is the one of
 * `RecipeBindingVerifier`: the pinned version exists and its `contentHash` is unchanged.
 */
@Injectable()
export class ScheduleRecipeReader {
  private readonly logger = new Logger(ScheduleRecipeReader.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The pinned version, or null when it is missing or its row is corrupt (then logged by ref). */
  async findVersion(ref: RecipeRef): Promise<RecipeVersionView | null> {
    const { recipeId, version } = parseRecipeRef(ref);
    const row = await this.prisma.recipeVersion.findUnique({ where: { recipeId_version: { recipeId, version } } });
    if (row === null) return null;
    try {
      return toRecipeVersionView(row);
    } catch (error) {
      if (!(error instanceof RecipeRowCorruptError)) throw error;
      this.logger.warn({ event: 'schedule.recipe-unreadable', recipeRef: ref, errorName: error.name });
      return null;
    }
  }

  async unresolved(query: ResolvableRefsQuery): Promise<UnresolvedRefs> {
    const wanted = [...new Set<AssetRef>([...query.bindings.map((binding) => binding.ref), ...query.references])];
    const hashes = await this.contentHashes(wanted);
    return {
      bindings: query.bindings.filter((binding) => hashes.get(binding.ref) !== binding.contentHash).map((binding) => binding.ref),
      references: query.references.filter((ref) => !hashes.has(ref)),
    };
  }

  /** `contentHash` per existing asset version, keyed by ref; an unknown ref is absent. */
  private async contentHashes(refs: readonly AssetRef[]): Promise<Map<AssetRef, string>> {
    const hashes = new Map<AssetRef, string>();
    for (const chunk of chunksOf(refs, REFS_PER_QUERY)) {
      const rows = await this.prisma.assetVersion.findMany({
        where: { OR: chunk.map((ref) => parseAssetRef(ref)) },
        select: { assetId: true, version: true, contentHash: true },
      });
      for (const row of rows) hashes.set(formatAssetRef({ assetId: row.assetId, version: row.version }), row.contentHash);
    }
    return hashes;
  }
}
