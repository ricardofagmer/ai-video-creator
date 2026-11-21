import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type ToolRunnerRequest } from '../tool-runner.protocol';
import { PathConfinementError, confineReadPath, confineRequest, confineWritePath, realRunnerRoots, type RunnerRoots } from './path-confinement';

/*
 * Every path a tool-runner request names is confined by real path (baseline review 2026-11-21):
 * outputs inside the scratch root, inputs inside the scratch root or a caller-named read root.
 * All folders are `fs.mkdtemp` folders removed after each test.
 */

interface World {
  base: string;
  scratch: string;
  run: string;
  outside: string;
  roots: RunnerRoots;
}

let world: World;

async function file(path: string): Promise<string> {
  await writeFile(path, 'fixture');
  return path;
}

async function refusal(promise: Promise<unknown>): Promise<PathConfinementError> {
  const error = await promise.then(
    () => assert.fail('the path was expected to be refused'),
    (caught: unknown) => caught,
  );
  assert.ok(error instanceof PathConfinementError);
  return error;
}

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), 'watcher-confinement-'));
  const scratch = join(base, 'scratch-root');
  const run = join(base, 'run');
  const outside = join(base, 'outside');
  await Promise.all([mkdir(join(scratch, 'studio-stage-1'), { recursive: true }), mkdir(run), mkdir(outside)]);
  world = { base, scratch, run, outside, roots: await realRunnerRoots({ read: [scratch, run], write: [scratch] }) };
});

afterEach(async () => {
  await rm(world.base, { recursive: true, force: true });
});

describe('confineReadPath', () => {
  it('returns the real path of an input inside a read root', async () => {
    const input = await file(join(world.run, 'video.mp4'));

    assert.equal(await confineReadPath('input', input, world.roots), await realpath(input));
  });

  it('refuses an input outside every read root', async () => {
    const input = await file(join(world.outside, 'secret.mp4'));

    const error = await refusal(confineReadPath('input', input, world.roots));

    assert.equal(error.reason, 'outside-roots');
    assert.equal(error.message.includes(world.outside), false);
  });

  it('refuses a symlink inside a root that points outside it', async () => {
    const target = await file(join(world.outside, 'secret.mp4'));
    const link = join(world.run, 'video.mp4');
    await symlink(target, link);

    assert.equal((await refusal(confineReadPath('input', link, world.roots))).reason, 'outside-roots');
  });

  it('resolves but does not confine inputs when the caller named no read roots', async () => {
    const input = await file(join(world.outside, 'track.mp3'));
    const roots: RunnerRoots = { read: null, write: world.roots.write };

    assert.equal(await confineReadPath('music', input, roots), await realpath(input));
  });

  it('refuses a missing input', async () => {
    assert.equal((await refusal(confineReadPath('input', join(world.run, 'absent.mp4'), world.roots))).reason, 'missing');
  });
});

describe('confineWritePath', () => {
  it('returns the real target of a new output inside the scratch root', async () => {
    const output = join(world.scratch, 'studio-stage-1', 'fades.mp4');

    assert.equal(await confineWritePath('output', output, world.roots), join(await realpath(join(world.scratch, 'studio-stage-1')), 'fades.mp4'));
  });

  it('refuses an output outside the write roots, the run folder included', async () => {
    assert.equal((await refusal(confineWritePath('output', join(world.run, 'fades.mp4'), world.roots))).reason, 'outside-roots');
    assert.equal((await refusal(confineWritePath('output', join(world.outside, 'fades.mp4'), world.roots))).reason, 'outside-roots');
  });

  it('refuses an output whose folder is a symlink out of the scratch root', async () => {
    const link = join(world.scratch, 'studio-stage-2');
    await symlink(world.outside, link);

    assert.equal((await refusal(confineWritePath('output', join(link, 'fades.mp4'), world.roots))).reason, 'outside-roots');
  });

  it('refuses an output that already exists, a planted symlink included', async () => {
    const stage = join(world.scratch, 'studio-stage-1');
    await file(join(stage, 'existing.mp4'));
    await symlink(join(world.outside, 'target.mp4'), join(stage, 'planted.mp4'));

    assert.equal((await refusal(confineWritePath('output', join(stage, 'existing.mp4'), world.roots))).reason, 'exists');
    assert.equal((await refusal(confineWritePath('output', join(stage, 'planted.mp4'), world.roots))).reason, 'exists');
  });
});

describe('confineRequest', () => {
  it('replaces every path of a music-bed request with its confined real path', async () => {
    const stage = join(world.scratch, 'studio-stage-1');
    const input = await file(join(world.run, 'captions.mp4'));
    const music = await file(join(world.run, 'track.mp3'));
    const request: ToolRunnerRequest = {
      command: 'music-bed',
      tools: { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' },
      input,
      output: join(stage, 'music.mp4'),
      music,
      loudnessTargetLufs: -16,
      truePeakTargetDb: -1.5,
    };

    const confined = await confineRequest(request, world.roots);

    assert.deepEqual(confined, {
      ...request,
      input: await realpath(input),
      music: await realpath(music),
      output: join(await realpath(stage), 'music.mp4'),
    });
  });

  it('refuses a narration clip outside the read roots', async () => {
    const request: ToolRunnerRequest = {
      command: 'narration-assemble',
      clips: [{ sceneId: 's1', path: await file(join(world.outside, 's1.wav')), text: 'Hello' }],
      output: join(world.scratch, 'studio-stage-1', 'narration.wav'),
    };

    const error = await refusal(confineRequest(request, world.roots));

    assert.equal(error.field, 'clips.path');
  });

  it('leaves a page-text request, which names no path, unchanged', async () => {
    const request: ToolRunnerRequest = { command: 'page-text', url: 'https://example.com/', maxChars: 1000 };

    assert.deepEqual(await confineRequest(request, world.roots), request);
  });

  it('refuses a root that does not exist', async () => {
    const error = await refusal(realRunnerRoots({ read: null, write: [join(world.base, 'absent')] }));

    assert.equal(error.field, 'write-root');
  });
});
