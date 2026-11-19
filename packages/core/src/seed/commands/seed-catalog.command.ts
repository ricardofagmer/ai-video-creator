import { Command } from '@nestjs/cqrs';
import { type SeedReport } from '../seed-report';

export interface SeedCatalogInput {
  /**
   * Absolute seed source root for this run; omitted uses `VIDEO_STUDIO_SEED_SOURCE_ROOT` or the
   * default workspace folder (`SeedSettings`).
   */
  sourceRoot?: string;
  /** Aborts between entries and inside hashing and copying (`studio catalog seed` on Ctrl-C). */
  signal?: AbortSignal;
}

/**
 * `studio catalog seed` (SPEC 0002 R1-07, PRD 5.5): registers the existing work from the seed
 * manifest as catalog versions with seed provenance, then loads every prompt and recipe found
 * under `seeds/prompts/` and `seeds/recipes/`. Idempotent: an entry whose content hash already
 * exists as a version is reported `unchanged` and nothing is written. A failing entry is
 * reported `failed` and the other entries still run.
 */
export class SeedCatalogCommand extends Command<SeedReport> {
  constructor(readonly input: SeedCatalogInput = {}) {
    super();
  }
}
