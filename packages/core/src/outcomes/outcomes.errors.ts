import { type AssetRef } from '@studio/shared/catalog';
import { ReviewError } from '../review/review.errors';

/** K5: `package` writes manifest.json before `review`, so a reviewed run without it is corrupt. */
export class OutcomeEvidenceMissingError extends ReviewError {
  override readonly category = 'internal';

  constructor(
    readonly runId: string,
    readonly file: 'manifest.json',
  ) {
    super(`Run ${runId} reached review without ${file}; its outcome cannot list the asset versions used`);
    this.name = 'OutcomeEvidenceMissingError';
  }
}

/** The manifest pins an `assetId@version` with no catalog row; versions are never deleted, so the database is not the one the run used. */
export class OutcomeAssetNotFoundError extends ReviewError {
  override readonly category = 'internal';

  constructor(
    readonly runId: string,
    readonly ref: AssetRef,
  ) {
    super(`Run ${runId} used ${ref}, which the catalog does not hold`);
    this.name = 'OutcomeAssetNotFoundError';
  }
}
