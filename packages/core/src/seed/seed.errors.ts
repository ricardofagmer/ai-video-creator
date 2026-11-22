/** Error taxonomy category (rules/observability.md); the CLI maps it to an exit message. */
export type SeedErrorCategory = 'validation' | 'not_found' | 'conflict' | 'internal';

/**
 * Base of every seed failure. Messages carry entry ids, asset ids and seed-relative names only,
 * never an absolute path or file content: a seed entry may point at biometric material (PRD 12).
 */
export abstract class SeedError extends Error {
  abstract readonly category: SeedErrorCategory;
}

/** The seed source root (`ENGINEOS_VIDEO_CREATOR_SEED_SOURCE_ROOT` or the command input) is unusable. */
export class SeedSourceRootInvalidError extends SeedError {
  override readonly category = 'validation';

  constructor(readonly reason: 'not-absolute' | 'not-normalized') {
    super(`Seed source root refused: ${reason}`);
    this.name = 'SeedSourceRootInvalidError';
  }
}

export interface SeedIssue {
  path: string;
  message: string;
}

/** `catalog.seed.json` is missing, is not JSON, or breaks the seed manifest schema. */
export class SeedManifestInvalidError extends SeedError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly SeedIssue[]) {
    super(`Seed manifest invalid: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'SeedManifestInvalidError';
  }
}

/** A seed file or folder named by one entry does not exist; only that entry fails. */
export class SeedSourceMissingError extends SeedError {
  override readonly category = 'not_found';

  constructor(readonly entryId: string) {
    super(`Seed source missing for entry ${entryId}`);
    this.name = 'SeedSourceMissingError';
  }
}

/** One entry's own data (a definition file, a skill front matter, a credit line) is unusable. */
export class SeedEntryInvalidError extends SeedError {
  override readonly category = 'validation';

  constructor(
    readonly entryId: string,
    readonly issues: readonly SeedIssue[],
  ) {
    super(
      `Seed entry ${entryId} invalid: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`,
    );
    this.name = 'SeedEntryInvalidError';
  }
}

/** The catalog already holds the asset id with a different kind; the seed never re-kinds an asset. */
export class SeedKindMismatchError extends SeedError {
  override readonly category = 'conflict';

  constructor(
    readonly entryId: string,
    readonly assetId: string,
  ) {
    super(`Seed entry ${entryId}: asset ${assetId} exists with another kind`);
    this.name = 'SeedKindMismatchError';
  }
}

/** The asset or recipe has more versions than the seed scans while looking for a matching hash. */
export class SeedHistoryTooLongError extends SeedError {
  override readonly category = 'internal';

  constructor(readonly entryId: string) {
    super(`Seed entry ${entryId}: version history exceeds the seed scan limit`);
    this.name = 'SeedHistoryTooLongError';
  }
}
