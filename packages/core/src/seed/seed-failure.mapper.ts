import { AssetStoreError, SourceNotFoundError } from '../asset-store';
import { CatalogError } from '../catalog';
import { RecipesError } from '../recipes';
import { SeedError, SeedSourceMissingError } from './seed.errors';
import { type SeedFailure } from './seed-report';

/**
 * Reduces an entry failure to safe report fields. Domain errors of the seed, catalog, recipes and
 * asset store carry path-free messages by contract; anything else is reported by category only,
 * because an unknown error message could quote a path under a biometric folder.
 */
export function toSeedFailure(entryId: string, error: unknown): SeedFailure {
  const known = error instanceof SourceNotFoundError ? new SeedSourceMissingError(entryId) : error;
  if (known instanceof SeedError || known instanceof CatalogError || known instanceof RecipesError || known instanceof AssetStoreError) {
    return { code: known.name, category: known.category, message: known.message };
  }
  return { code: 'UnexpectedSeedError', category: 'internal', message: `Seed entry ${entryId} failed unexpectedly` };
}
