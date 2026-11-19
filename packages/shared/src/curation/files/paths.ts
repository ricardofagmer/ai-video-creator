import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { CurationIdSchema, type CurationId } from '../../common/ids';
import { RunFileError } from '../../run-files/errors';
import { CURATIONS_FOLDER_NAME, curationFileNames, type CurationFileKey } from '../constants';

/** A path that would leave `<data home>/curations/` or name a folder that is not a curation. */
export class CurationPathError extends RunFileError {
  override readonly code = 'path-outside-run';

  constructor(filePath: string, reason: string) {
    super(`Refused curation path (${reason}): ${filePath}`, filePath);
    this.name = 'CurationPathError';
  }
}

/**
 * Where one curation lives. `curationsRoot` is the absolute data-home folder named `curations`
 * (`DataHome.curations`); `curationId` is validated as a ULID before any path is joined.
 */
export interface CurationLocation {
  readonly curationsRoot: string;
  readonly curationId: CurationId;
}

/** The resolved `curations/` root; refuses a relative path or a folder with another name. */
export function checkedCurationsRoot(curationsRoot: string): string {
  if (!isAbsolute(curationsRoot)) throw new CurationPathError(curationsRoot, 'curations root must be absolute');
  const root = resolve(curationsRoot);
  if (basename(root) !== CURATIONS_FOLDER_NAME) {
    throw new CurationPathError(root, `curations root must be a folder named ${CURATIONS_FOLDER_NAME}`);
  }
  return root;
}

/** `<curationsRoot>/<curationId>`. */
export function curationDirectory(location: CurationLocation): string {
  const root = checkedCurationsRoot(location.curationsRoot);
  if (!CurationIdSchema.safeParse(location.curationId).success) {
    throw new CurationPathError(join(root, location.curationId), 'invalid curationId');
  }
  return join(root, location.curationId);
}

/** One of the five curation files; no other name can be resolved inside a curation folder. */
export function curationFilePath(location: CurationLocation, file: CurationFileKey): string {
  const directory = curationDirectory(location);
  const target = resolve(directory, curationFileNames[file]);
  if (dirname(target) !== directory || !target.startsWith(`${directory}${sep}`)) {
    throw new CurationPathError(target, 'escapes the curation folder');
  }
  return target;
}

/**
 * The location of an absolute curation folder such as the `curationDir` the C6 curation ports
 * receive. Refuses anything that is not `<folder named curations>/<ULID>` after resolution.
 */
export function curationLocationFromDirectory(curationDir: string): CurationLocation {
  if (!isAbsolute(curationDir)) throw new CurationPathError(curationDir, 'curation folder must be absolute');
  const directory = resolve(curationDir);
  const curationId = CurationIdSchema.safeParse(basename(directory));
  if (!curationId.success) throw new CurationPathError(directory, 'folder name is not a curationId');
  return { curationsRoot: checkedCurationsRoot(dirname(directory)), curationId: curationId.data };
}
