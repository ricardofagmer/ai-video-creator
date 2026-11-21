import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HyperframesRenderRequestSchema, ToolRunnerRequestSchema } from '../tool-runner.protocol';

/*
 * The frozen `hyperframes-render` wire contract (SPEC 0008 section 4.4). The child parses the
 * request before anything runs, so every rejected shape here means no file written and no start.
 */

function validRuntime(): Record<string, string | number> {
  return {
    binPath: '/fixture/workspace/node_modules/hyperframes/bin/hyperframes.mjs',
    browserPath: '/fixture/data-home/hyperframes/cache/browser/headless-shell',
    configDir: '/fixture/data-home/hyperframes/config',
    cacheDir: '/fixture/data-home/hyperframes/cache',
    homeDir: '/fixture/data-home/hyperframes/home',
    sandboxProfilePath: '/fixture/workspace/packages/hyperframes/sandbox/render.sb',
    ownerConfigDir: '/fixture/owner-home/.hyperframes',
    // SPEC 0008 section 17.5 (rev 2): the nine strict sandbox fields.
    ownerHomeDir: '/fixture/owner-home',
    studioRoot: '/fixture/workspace',
    dataHomeRoot: '/fixture/data-home',
    hyperframesRoot: '/fixture/data-home/hyperframes',
    chromeDir: '/fixture/data-home/hyperframes/cache/chrome',
    ffmpegBin: '/fixture/tools/ffmpeg',
    ffprobeBin: '/fixture/tools/ffprobe',
    apiPort: 4311,
    webPort: 4310,
  };
}

function validRequest(): Record<string, unknown> {
  return {
    command: 'hyperframes-render',
    tools: { ffmpegPath: '/fixture/tools/ffmpeg', ffprobePath: '/fixture/tools/ffprobe' },
    templateDir: '/fixture/scratch/render-0001/staged-template',
    variables: { title: 'A title', sceneCount: 3, showLogo: true },
    width: 1080,
    height: 1920,
    fps: 30,
    durationS: 12.5,
    audio: '/fixture/scratch/render-0001/narration.wav',
    output: '/fixture/scratch/render-0001/composition.mp4',
    scratchDir: '/fixture/scratch/render-0001',
    runtime: validRuntime(),
  };
}

function variablesNamed(count: number): Record<string, string> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`variable${index}`, 'value']));
}

describe('HyperframesRenderRequestSchema (section 4.4)', () => {
  it('accepts the frozen request shape and routes it through the tool-runner union', () => {
    assert.equal(HyperframesRenderRequestSchema.safeParse(validRequest()).success, true);
    const routed = ToolRunnerRequestSchema.safeParse(validRequest());
    assert.ok(routed.success);
    assert.equal(routed.data.command, 'hyperframes-render');
  });

  it('rejects an unknown top-level key', () => {
    assert.equal(HyperframesRenderRequestSchema.safeParse({ ...validRequest(), env: { PATH: '/bin' } }).success, false);
  });

  it('rejects an unknown runtime key, such as a caller-chosen node path', () => {
    const request = { ...validRequest(), runtime: { ...validRuntime(), nodePath: '/fixture/other/node' } };

    assert.equal(HyperframesRenderRequestSchema.safeParse(request).success, false);
  });

  it('rejects a runtime that lacks the owner hyperframes folder for the sandbox', () => {
    const runtime = validRuntime();
    delete runtime['ownerConfigDir'];

    assert.equal(HyperframesRenderRequestSchema.safeParse({ ...validRequest(), runtime }).success, false);
  });

  it('rejects a relative staged template path', () => {
    assert.equal(HyperframesRenderRequestSchema.safeParse({ ...validRequest(), templateDir: 'staged-template' }).success, false);
  });

  it('rejects variable names outside the flat lowerCamel pattern', () => {
    for (const name of ['Title', 'my_title', '1title', 'a'.repeat(41)]) {
      const parsed = HyperframesRenderRequestSchema.safeParse({ ...validRequest(), variables: { [name]: 'value' } });
      assert.equal(parsed.success, false, `the name ${name} was accepted`);
    }
  });

  it('rejects nested, array, null and non-finite variable values and strings over 500 characters', () => {
    for (const value of [{ nested: 'x' }, ['x'], null, Number.POSITIVE_INFINITY, Number.NaN, 'x'.repeat(501)]) {
      const parsed = HyperframesRenderRequestSchema.safeParse({ ...validRequest(), variables: { title: value } });
      assert.equal(parsed.success, false, `the value ${String(value)} was accepted`);
    }
  });

  it('accepts a 500-character string variable and exactly 32 variables', () => {
    assert.equal(HyperframesRenderRequestSchema.safeParse({ ...validRequest(), variables: { title: 'x'.repeat(500) } }).success, true);
    assert.equal(HyperframesRenderRequestSchema.safeParse({ ...validRequest(), variables: variablesNamed(32) }).success, true);
  });

  it('rejects 33 variables', () => {
    assert.equal(HyperframesRenderRequestSchema.safeParse({ ...validRequest(), variables: variablesNamed(33) }).success, false);
  });

  it('rejects a fractional frame rate, a zero duration and a size outside 16 to 7680 pixels', () => {
    for (const override of [{ fps: 29.97 }, { durationS: 0 }, { width: 15 }, { height: 7681 }]) {
      assert.equal(HyperframesRenderRequestSchema.safeParse({ ...validRequest(), ...override }).success, false, JSON.stringify(override));
    }
  });
});
