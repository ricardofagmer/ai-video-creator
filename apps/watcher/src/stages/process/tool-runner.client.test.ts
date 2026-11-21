import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toolPathEnvironment, toolRunnerEnvelope } from './tool-runner.client';
import { ToolRunnerEnvelopeSchema, type ToolRunnerRequest } from './tool-runner.protocol';

/*
 * What the client hands the runner child (baseline review 2026-11-21): tool paths through the
 * child's environment, read once at its start, and the confinement roots beside the request.
 * Pure functions only; no child process is started.
 */

const FADES: ToolRunnerRequest = { command: 'fades', input: '/fixture/run/video.mp4', output: '/fixture/tmp/studio-stage-1/fades.mp4' };

describe('toolPathEnvironment', () => {
  it('leaves the default names out so the child looks them up on its own PATH', () => {
    assert.deepEqual(toolPathEnvironment({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' }), {});
  });

  it('passes configured paths on for the child to validate', () => {
    assert.deepEqual(toolPathEnvironment({ ffmpegPath: '/opt/tools/ffmpeg', ffprobePath: 'tools/ffprobe' }), {
      FFMPEG_PATH: '/opt/tools/ffmpeg',
      FFPROBE_PATH: 'tools/ffprobe',
    });
  });
});

describe('toolRunnerEnvelope', () => {
  it('confines writes to the scratch root and leaves reads unconfined when no read roots are named', () => {
    const envelope = toolRunnerEnvelope(FADES, { tmpDir: '/fixture/tmp' }, undefined);

    assert.deepEqual(envelope.roots, { read: null, write: ['/fixture/tmp'] });
    assert.equal(ToolRunnerEnvelopeSchema.safeParse(envelope).success, true);
  });

  it('adds the scratch root to the caller-named read roots', () => {
    const envelope = toolRunnerEnvelope(FADES, { tmpDir: '/fixture/tmp' }, ['/fixture/run']);

    assert.deepEqual(envelope.roots, { read: ['/fixture/tmp', '/fixture/run'], write: ['/fixture/tmp'] });
  });

  it('still accepts a request that carries the deprecated tools field', () => {
    const envelope = toolRunnerEnvelope({ ...FADES, tools: { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' } }, { tmpDir: '/fixture/tmp' }, undefined);

    assert.equal(ToolRunnerEnvelopeSchema.safeParse(envelope).success, true);
  });

  it('refuses a relative read root at the contract', () => {
    const envelope = toolRunnerEnvelope(FADES, { tmpDir: '/fixture/tmp' }, ['relative/run']);

    assert.equal(ToolRunnerEnvelopeSchema.safeParse(envelope).success, false);
  });
});
