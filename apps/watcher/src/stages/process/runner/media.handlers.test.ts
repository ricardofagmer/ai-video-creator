import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { slateRender } from './media.handlers';

/*
 * The runner's own ffmpeg calls (baseline review 2026-11-21): the program is the path resolved at
 * the runner's start, never the request's `tools`, and every file input carries the protocol and
 * demuxer guard before its `-i`. ffmpeg is a fixture shell script that records its argv; no real
 * ffmpeg runs.
 */

let root: string;
let argsFile: string;
let fakeFfmpeg: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'watcher-media-handlers-'));
  argsFile = join(root, 'argv.txt');
  fakeFfmpeg = join(root, 'fake-ffmpeg');
  await writeFile(fakeFfmpeg, `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsFile}"\n`);
  await chmod(fakeFfmpeg, 0o755);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('slateRender', () => {
  it('runs the startup ffmpeg with the narration input guarded to local files and known demuxers', async () => {
    const audio = join(root, 'narration.wav');

    await slateRender(
      {
        command: 'slate-render',
        tools: { ffmpegPath: join(root, 'request-ffmpeg-never-used'), ffprobePath: join(root, 'request-ffprobe-never-used') },
        width: 1080,
        height: 1920,
        fps: 30,
        durationS: 2,
        audio,
        output: join(root, 'composition.mp4'),
      },
      { ffmpegPath: fakeFfmpeg, ffprobePath: join(root, 'unused-ffprobe') },
    );

    const argv = (await readFile(argsFile, 'utf8')).trimEnd().split('\n');
    const audioIndex = argv.indexOf(audio);
    assert.ok(audioIndex > 0, 'the narration path is an argument');
    assert.equal(argv[audioIndex - 1], '-i');
    const guard = argv.slice(audioIndex - 5, audioIndex - 1);
    assert.equal(guard[0], '-protocol_whitelist');
    assert.equal(guard[1], 'file');
    assert.equal(guard[2], '-format_whitelist');
    assert.equal(guard[3]?.split(',').includes('wav'), true);
    assert.equal(guard[3]?.includes('hls'), false);
  });
});
