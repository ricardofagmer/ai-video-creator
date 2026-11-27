// SHA-256 of files and deterministic tree walks shared by the download, manifest and signing steps.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Every entry under `root`, depth first, children sorted by name so output is stable. Yields
 * `{ path, relative, kind }` with kind `file`, `directory` or `symlink`; symlinks are reported and
 * never followed.
 */
export async function* walkTree(root, relative = '') {
  const folder = relative === '' ? root : join(root, relative);
  const names = (await readdir(folder)).sort();
  for (const name of names) {
    const childRelative = relative === '' ? name : `${relative}/${name}`;
    const childPath = join(root, childRelative);
    const stats = await lstat(childPath);
    if (stats.isSymbolicLink()) {
      yield { path: childPath, relative: childRelative, kind: 'symlink' };
    } else if (stats.isDirectory()) {
      yield { path: childPath, relative: childRelative, kind: 'directory' };
      yield* walkTree(root, childRelative);
    } else if (stats.isFile()) {
      yield { path: childPath, relative: childRelative, kind: 'file' };
    }
  }
}

export async function treeSizeInBytes(root) {
  let total = 0;
  for await (const entry of walkTree(root)) {
    if (entry.kind === 'file') total += (await lstat(entry.path)).size;
  }
  return total;
}
