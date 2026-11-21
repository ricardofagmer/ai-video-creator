import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { UnsafePathError } from '../asset-store/asset-store.errors';
import { withSkillDraftFolder } from './skill-draft-folder';

/* Baseline review L1: the draft copy reads from a checked handle and never follows a symlink. */

describe('withSkillDraftFolder', () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'studio-skill-draft-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('copies the files, replaces the entry file and removes the draft afterwards', async () => {
    await writeFile(join(root, 'SKILL.md'), 'old body');
    await writeFile(join(root, 'notes.md'), 'notes');
    let draftFolder = '';
    const result = await withSkillDraftFolder(
      {
        files: [
          { relativePath: 'SKILL.md', absolutePath: join(root, 'SKILL.md'), contentHash: null },
          { relativePath: 'docs/notes.md', absolutePath: join(root, 'notes.md'), contentHash: null },
        ],
        entryFile: 'SKILL.md',
        newBody: 'new body',
      },
      async (folder) => {
        draftFolder = folder;
        return {
          entry: await readFile(join(folder, 'SKILL.md'), 'utf8'),
          notes: await readFile(join(folder, 'docs', 'notes.md'), 'utf8'),
        };
      },
    );
    assert.deepEqual(result, { entry: 'new body', notes: 'notes' });
    await assert.rejects(stat(draftFolder), { code: 'ENOENT' });
  });

  it('refuses a source that is a symlink before work runs', async () => {
    await writeFile(join(root, 'outside.md'), 'not part of the skill');
    await symlink(join(root, 'outside.md'), join(root, 'linked.md'));
    let workRan = false;
    await assert.rejects(
      withSkillDraftFolder(
        { files: [{ relativePath: 'SKILL.md', absolutePath: join(root, 'linked.md'), contentHash: null }], entryFile: 'SKILL.md', newBody: 'x' },
        async () => {
          workRan = true;
        },
      ),
      (error: unknown) => error instanceof UnsafePathError && error.reason === 'not-a-file',
    );
    assert.equal(workRan, false);
  });
});
