import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { AssetRefSchema, type AssetRef } from '../../catalog/asset-kind';
import { RunFileError } from '../../run-files/errors';
import { AssetJobKindSchema, type AssetJobKind } from '../asset-job';
import { ASSET_JOBS_FOLDER_NAME, assetJobFileNames, type AssetJobFileKey } from '../constants';

/** A path that would leave `<data home>/asset-jobs/` or name a folder that is not a job. */
export class AssetJobPathError extends RunFileError {
  override readonly code = 'path-outside-run';

  constructor(filePath: string, reason: string) {
    super(`Refused asset job path (${reason}): ${filePath}`, filePath);
    this.name = 'AssetJobPathError';
  }
}

/**
 * Where one job lives. `assetJobsRoot` is the absolute data-home folder named `asset-jobs`
 * (`DataHome.assetJobs`); `kind` and `ref` are validated before any path is joined, so a folder
 * name always comes from a checked `assetId@version`, never from request text.
 */
export interface AssetJobLocation {
  readonly assetJobsRoot: string;
  readonly kind: AssetJobKind;
  readonly ref: AssetRef;
}

/** The resolved `asset-jobs/` root; refuses a relative path or a folder with another name. */
export function checkedAssetJobsRoot(assetJobsRoot: string): string {
  if (!isAbsolute(assetJobsRoot)) throw new AssetJobPathError(assetJobsRoot, 'asset jobs root must be absolute');
  const root = resolve(assetJobsRoot);
  if (basename(root) !== ASSET_JOBS_FOLDER_NAME) {
    throw new AssetJobPathError(root, `asset jobs root must be a folder named ${ASSET_JOBS_FOLDER_NAME}`);
  }
  return root;
}

/** `<assetJobsRoot>/<kind>`. */
export function assetJobKindDirectory(assetJobsRoot: string, kind: AssetJobKind): string {
  const root = checkedAssetJobsRoot(assetJobsRoot);
  if (!AssetJobKindSchema.safeParse(kind).success) throw new AssetJobPathError(join(root, String(kind)), 'invalid job kind');
  return join(root, kind);
}

/** `<assetJobsRoot>/<kind>/<assetId>@<version>`. */
export function assetJobDirectory(location: AssetJobLocation): string {
  const kindDirectory = assetJobKindDirectory(location.assetJobsRoot, location.kind);
  if (!AssetRefSchema.safeParse(location.ref).success) throw new AssetJobPathError(join(kindDirectory, String(location.ref)), 'invalid asset ref');
  return join(kindDirectory, location.ref);
}

/** One of the job's own files; no other name can be resolved inside a job folder. */
export function assetJobFilePath(location: AssetJobLocation, file: AssetJobFileKey): string {
  const directory = assetJobDirectory(location);
  const target = resolve(directory, assetJobFileNames[file]);
  if (dirname(target) !== directory || !target.startsWith(`${directory}${sep}`)) {
    throw new AssetJobPathError(target, 'escapes the job folder');
  }
  return target;
}
