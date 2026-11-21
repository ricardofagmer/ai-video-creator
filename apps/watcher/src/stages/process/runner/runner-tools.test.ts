import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ExternalToolError } from '@ace/toolbox/dist/errors';
import { describeRunnerTools, requireRunnerTools, resolveRunnerTools } from './runner-tools';

/*
 * Tool paths are resolved once from the runner's own environment (baseline review 2026-11-21,
 * "tool paths resolved once, not per request"). The programs are fixture files in an
 * `fs.mkdtemp` folder; nothing is ever executed.
 */

let root: string;
let binDir: string;

async function fixtureProgram(name: string, mode: number): Promise<string> {
  const path = join(binDir, name);
  await writeFile(path, '#!/bin/sh\nexit 0\n');
  await chmod(path, mode);
  return path;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'watcher-runner-tools-'));
  binDir = join(root, 'bin');
  await mkdir(binDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('resolveRunnerTools', () => {
  it('uses absolute executable settings', async () => {
    const ffmpeg = await fixtureProgram('ffmpeg-7', 0o755);
    const ffprobe = await fixtureProgram('ffprobe-7', 0o755);

    const tools = resolveRunnerTools({ FFMPEG_PATH: ffmpeg, FFPROBE_PATH: ffprobe, PATH: '' });

    assert.deepEqual(tools, { status: 'resolved', paths: { ffmpegPath: ffmpeg, ffprobePath: ffprobe }, sources: { ffmpeg: 'setting', ffprobe: 'setting' } });
    assert.equal(requireRunnerTools(tools).ffmpegPath, ffmpeg);
  });

  it('looks the default names up once in absolute PATH entries, skipping relative ones', async () => {
    const ffmpeg = await fixtureProgram('ffmpeg', 0o755);
    const ffprobe = await fixtureProgram('ffprobe', 0o755);

    const tools = resolveRunnerTools({ PATH: ['relative/bin', join(root, 'missing'), binDir].join(delimiter) });

    assert.equal(tools.status, 'resolved');
    assert.deepEqual(requireRunnerTools(tools), { ffmpegPath: ffmpeg, ffprobePath: ffprobe });
    assert.match(describeRunnerTools(tools), /ffmpeg=.*\(path-lookup\)/);
  });

  it('refuses a relative setting instead of searching for it', async () => {
    await fixtureProgram('ffmpeg', 0o755);
    const ffprobe = await fixtureProgram('ffprobe', 0o755);

    const tools = resolveRunnerTools({ FFMPEG_PATH: 'ffmpeg', FFPROBE_PATH: ffprobe, PATH: binDir });

    assert.equal(tools.status, 'unavailable');
    assert.match(describeRunnerTools(tools), /FFMPEG_PATH must be an absolute path/);
  });

  it('refuses a setting that is not an executable file', async () => {
    const notExecutable = await fixtureProgram('ffmpeg', 0o644);
    const ffprobe = await fixtureProgram('ffprobe', 0o755);

    assert.equal(resolveRunnerTools({ FFMPEG_PATH: notExecutable, FFPROBE_PATH: ffprobe, PATH: '' }).status, 'unavailable');
    assert.equal(resolveRunnerTools({ FFMPEG_PATH: binDir, FFPROBE_PATH: ffprobe, PATH: '' }).status, 'unavailable');
  });

  it('reports unavailable tools as a tool error only when a media command asks for them', () => {
    const tools = resolveRunnerTools({ PATH: join(root, 'empty') });

    assert.equal(tools.status, 'unavailable');
    assert.throws(() => requireRunnerTools(tools), ExternalToolError);
  });
});
