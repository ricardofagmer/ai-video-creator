import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readSourceLines, type SourceLinesRequest } from './source-lines.js';

/*
 * `readSourceLines` never follows a link out of the run folder and never reads a non-regular file
 * (hardening note after run 2). The files live in an `fs.mkdtemp` folder; no real data home.
 */

let root: string;

function request(filePath: string): SourceLinesRequest {
  return { filePath, maxBytes: 1_048_576 * 4, targetId: 'run', signal: new AbortController().signal };
}

describe('readSourceLines file checks', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-cli-source-lines-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads the complete lines of a regular file', async () => {
    const file = join(root, 'events.jsonl');
    await writeFile(file, '{"a":1}\n{"a":2}\n');
    assert.deepEqual(await readSourceLines(request(file)), [{ a: 1 }, { a: 2 }]);
  });

  it('reads a link as no lines, even when it points at a readable file', async () => {
    const outside = join(root, 'outside.jsonl');
    await writeFile(outside, '{"secret":true}\n');
    const link = join(root, 'events.jsonl');
    await symlink(outside, link);
    assert.deepEqual(await readSourceLines(request(link)), []);
  });

  it('reads a folder in the file position as no lines', async () => {
    const folder = join(root, 'events.jsonl');
    await mkdir(folder);
    assert.deepEqual(await readSourceLines(request(folder)), []);
  });

  it('reads a missing file as no lines', async () => {
    assert.deepEqual(await readSourceLines(request(join(root, 'absent.jsonl'))), []);
  });
});
