import { isAbsolute, join, normalize } from 'node:path';
import { AbsolutePathSchema, RelativePathSchema } from '@studio/shared/catalog';
import { isInsideOrEqual } from '../asset-store';
import { SeedManifestInvalidError, SeedSourceRootInvalidError } from './seed.errors';

/**
 * Moves the seed source root, for tests and for a workspace kept elsewhere. Unset, the root is
 * the owner's workspace folder that holds `video-studio/`, `ai-creator-engine/`, the Spesia run
 * and `ricardo-clone/` side by side (SPEC 0002 R1-07).
 */
export const SEED_SOURCE_ROOT_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_SEED_SOURCE_ROOT';

/** Default root, relative to the user's home folder. */
export const DEFAULT_SEED_SOURCE_ROOT_SEGMENTS: readonly string[] = ['projects', 'ai-video-creator'];

/** Where the declarative seed manifest sits, relative to the seed source root. */
export const SEED_MANIFEST_RELATIVE_PATH = 'video-studio/seeds/catalog.seed.json';

/**
 * Resolved seed settings. A class so Nest injects it by type; it holds a folder path only, never
 * a secret, and is built once by `SeedModule` (rules/architecture.md "Configuration").
 */
export class SeedSettings {
  constructor(readonly sourceRoot: string) {}
}

export function assertSeedSourceRoot(root: string): string {
  if (!isAbsolute(root)) throw new SeedSourceRootInvalidError('not-absolute');
  const hasTrailingSlash = root.length > 1 && root.endsWith('/');
  if (normalize(root) !== root || hasTrailingSlash || !AbsolutePathSchema.safeParse(root).success) {
    throw new SeedSourceRootInvalidError('not-normalized');
  }
  return root;
}

export interface SeedSourceRootSource {
  homeDirectory: string;
  /** Value of `ENGINEOS_VIDEO_CREATOR_SEED_SOURCE_ROOT`; undefined or empty means the default. */
  override: string | undefined;
}

export function resolveSeedSourceRoot(source: SeedSourceRootSource): string {
  const override = source.override?.trim();
  const root = override !== undefined && override !== '' ? override : join(source.homeDirectory, ...DEFAULT_SEED_SOURCE_ROOT_SEGMENTS);
  return assertSeedSourceRoot(root);
}

/**
 * Absolute path of a seed-relative path. The manifest schema already refuses `..` segments; the
 * containment check stays as a second guard because this path is later read or hashed.
 */
export function resolveSeedPath(root: string, relativePath: string): string {
  if (!RelativePathSchema.safeParse(relativePath).success) {
    throw new SeedManifestInvalidError([{ path: 'path', message: 'expected a seed-relative path' }]);
  }
  const absolutePath = join(root, relativePath);
  if (!isInsideOrEqual(root, absolutePath) || absolutePath === root) {
    throw new SeedManifestInvalidError([{ path: 'path', message: 'seed path escapes the seed source root' }]);
  }
  return absolutePath;
}
