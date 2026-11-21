import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RunFileNotFoundError, RunPathOutsideRunError } from './errors';
import { resolveInsideRun, resolveInsideRunReal } from './run-paths';

/*
 * Symlink check (baseline review): `resolveInsideRun` is lexical only, so a link inside a run folder
 * could lead a read or write outside it. `resolveInsideRunReal` resolves the links on disk and
 * refuses any real path outside the run folder's own real path. Everything lives in a temp dir: the
 * run folder and an "outside" folder next to it.
 */

let base: string;
let runDir: string;
let outside: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'run-paths-'));
  runDir = join(base, 'run');
  outside = join(base, 'outside');
  await mkdir(join(runDir, 'stages', '01-plan'), { recursive: true });
  await mkdir(outside);
  await writeFile(join(outside, 'secret.txt'), 'outside the run');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('resolveInsideRunReal', () => {
  it('returns the real path of a file inside the run folder', async () => {
    await writeFile(join(runDir, 'stages', '01-plan', 'plan.json'), '{}');
    assert.equal(await resolveInsideRunReal(runDir, 'stages/01-plan/plan.json'), join(await realpath(runDir), 'stages', '01-plan', 'plan.json'));
  });

  it('accepts a file that does not exist yet, through its deepest existing folder', async () => {
    assert.equal(await resolveInsideRunReal(runDir, 'archive/01-plan/plan.json'), join(await realpath(runDir), 'archive', '01-plan', 'plan.json'));
  });

  it('refuses a file link that leads outside the run folder', async () => {
    await symlink(join(outside, 'secret.txt'), join(runDir, 'stages', '01-plan', 'brief.json'));
    // The lexical check alone lets it through: that was the finding.
    assert.equal(resolveInsideRun(runDir, 'stages/01-plan/brief.json'), join(runDir, 'stages', '01-plan', 'brief.json'));
    await assert.rejects(resolveInsideRunReal(runDir, 'stages/01-plan/brief.json'), RunPathOutsideRunError);
  });

  it('refuses a folder link in the middle of the path, even for a file still to be written', async () => {
    await symlink(outside, join(runDir, 'archive'));
    await assert.rejects(resolveInsideRunReal(runDir, 'archive/new.json'), RunPathOutsideRunError);
  });

  it('refuses a dangling link, which a write would follow to create its target', async () => {
    await symlink(join(outside, 'not-yet.txt'), join(runDir, 'out.json'));
    await assert.rejects(resolveInsideRunReal(runDir, 'out.json'), RunPathOutsideRunError);
  });

  it('allows a link whose target stays inside the run folder', async () => {
    await writeFile(join(runDir, 'stages', '01-plan', 'plan.json'), '{}');
    await symlink(join(runDir, 'stages', '01-plan', 'plan.json'), join(runDir, 'plan-link.json'));
    assert.equal(await resolveInsideRunReal(runDir, 'plan-link.json'), join(await realpath(runDir), 'stages', '01-plan', 'plan.json'));
  });

  it('accepts a run folder reached through a link (the real root is compared)', async () => {
    const linkedRun = join(base, 'linked-run');
    await symlink(runDir, linkedRun);
    await writeFile(join(runDir, 'run.json'), '{}');
    assert.equal(await resolveInsideRunReal(linkedRun, 'run.json'), join(await realpath(runDir), 'run.json'));
  });

  it('keeps the lexical refusals and reports a missing run folder', async () => {
    await assert.rejects(resolveInsideRunReal(runDir, '../outside/secret.txt'), RunPathOutsideRunError);
    await assert.rejects(resolveInsideRunReal('relative/run', 'run.json'), RunPathOutsideRunError);
    await assert.rejects(resolveInsideRunReal(join(base, 'missing-run'), 'run.json'), RunFileNotFoundError);
  });
});
