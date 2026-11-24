import { readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { HYPERFRAMES_PIN } from '@studio/shared/hyperframes';
import { HyperframesPinMismatchError } from './errors';
import { dependencyTreeRoot, packageRoot } from './package-paths';

/*
 * The one HyperFrames executable the studio starts (SPEC 0008 section 4.4, K3, AC 68): the
 * package's own `bin/hyperframes.mjs`, run as `<node> <bin>`, never `npx` and never a PATH lookup.
 * The version is asserted on every call, so a changed install refuses before any process starts.
 */

const BIN_RELATIVE_PATH = join('bin', 'hyperframes.mjs');
const MANIFEST_LIMIT_BYTES = 1_048_576;

/** The installed manifest's version, or null unless it is the `hyperframes` package's manifest. */
function versionOf(manifest: unknown): string | null {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return null;
  const name: unknown = Reflect.get(manifest, 'name');
  const version: unknown = Reflect.get(manifest, 'version');
  return name === 'hyperframes' && typeof version === 'string' ? version : null;
}

function isInside(folder: string, candidate: string): boolean {
  return candidate.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);
}

function realPathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    // A missing link or folder means the dependency is not installed; reported as a pin mismatch.
    return null;
  }
}

function readInstalledVersion(packageFolder: string): string {
  let text: string;
  try {
    text = readFileSync(join(packageFolder, 'package.json'), 'utf8');
  } catch {
    throw new HyperframesPinMismatchError('manifest-unreadable');
  }
  if (text.length > MANIFEST_LIMIT_BYTES) throw new HyperframesPinMismatchError('manifest-unreadable');
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new HyperframesPinMismatchError('manifest-unreadable');
  }
  const version = versionOf(manifest);
  if (version === null) throw new HyperframesPinMismatchError('manifest-unreadable');
  return version;
}

/** The real path of the pinned bin; throws `HyperframesPinMismatchError` unless it is 0.9.72. */
export function pinnedBinPath(): string {
  const packageFolder = realPathOrNull(join(packageRoot(), 'node_modules', 'hyperframes'));
  if (packageFolder === null) throw new HyperframesPinMismatchError('not-installed');
  const workspaceModules = realPathOrNull(dependencyTreeRoot());
  if (workspaceModules === null || !isInside(workspaceModules, packageFolder)) {
    throw new HyperframesPinMismatchError('outside-workspace');
  }
  if (readInstalledVersion(packageFolder) !== HYPERFRAMES_PIN) throw new HyperframesPinMismatchError('other-version');
  const binPath = realPathOrNull(join(packageFolder, BIN_RELATIVE_PATH));
  if (binPath === null) throw new HyperframesPinMismatchError('not-installed');
  if (!isInside(packageFolder, binPath)) throw new HyperframesPinMismatchError('outside-workspace');
  return binPath;
}
