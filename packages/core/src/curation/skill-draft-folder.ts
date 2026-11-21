import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { toAssetStoreError } from '../asset-store/fs-errors';
import { resolveInside } from '../asset-store/path-guards';
import { openRegularFile } from '../asset-store/regular-file';
import { type SkillSourceFile } from './curation-subject-body.reader';

/** The draft folder is private to this process while it exists. */
const DRAFT_FILE_MODE = 0o600;

/**
 * Copies from the handle that was checked (`openRegularFile`: lstat, `O_NOFOLLOW` open, fstat,
 * same dev and ino), so a source swapped for a symlink after listing is refused, not followed.
 * `wx` never writes through anything already at the target.
 */
async function copyCheckedFile(sourcePath: string, targetPath: string): Promise<void> {
  const handle = await openRegularFile(sourcePath);
  try {
    await pipeline(handle.createReadStream({ autoClose: false }), createWriteStream(targetPath, { flags: 'wx', mode: DRAFT_FILE_MODE }));
  } catch (error) {
    throw toAssetStoreError(error);
  } finally {
    await handle.close();
  }
}

export interface SkillDraftFolderRequest {
  files: readonly SkillSourceFile[];
  /** C1 relative path of the skill's entry file; its bytes become `newBody`. */
  entryFile: string;
  newBody: string;
}

/**
 * A skill is a folder asset, so a saved proposal is the subject's folder with only the entry file
 * replaced (SPEC 0005 section 5.7). The folder is assembled under the OS temp directory, outside
 * the data home and the content store, handed to `work` (the catalog `import-folder` save), and
 * removed afterwards whatever happens. Every target path is resolved inside the temp folder.
 */
export async function withSkillDraftFolder<T>(request: SkillDraftFolderRequest, work: (folderPath: string) => Promise<T>): Promise<T> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'studio-curation-'));
  try {
    const folder = join(tempRoot, 'skill');
    await mkdir(folder);
    for (const file of request.files) {
      const target = resolveInside(folder, file.relativePath);
      await mkdir(dirname(target), { recursive: true });
      await copyCheckedFile(file.absolutePath, target);
    }
    await writeFile(resolveInside(folder, request.entryFile), request.newBody, 'utf8');
    return await work(folder);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
