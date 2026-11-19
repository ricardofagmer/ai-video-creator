/** The only volume root besides the home folder a by-reference path may lie under (A24). */
const VOLUMES_ROOT = '/Volumes';

/**
 * Where the owner's by-reference material may live (SPEC 0002 rev 4, A24): below the owner's home
 * folder or below `/Volumes/`. A class so Nest injects it by type and a test can provide its own
 * home folder; the module builds it once from `os.homedir()`.
 */
export class ReferenceRoots {
  readonly volumesRoot = VOLUMES_ROOT;

  constructor(readonly homeDirectory: string) {}
}
