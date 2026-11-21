import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_TEMPLATE_ENGINE, HYPERFRAMES_PIN, hyperframesPaths } from '@studio/shared/hyperframes';
import { HyperframesRenderRequestSchema, ToolRunnerRequestSchema } from '../process/tool-runner.protocol';
import {
  BRAND_ACCENT,
  FAKE_BIN_PATH,
  FAKE_PROFILE,
  HYPERFRAMES_TEMPLATE_REF,
  NARRATION_AUDIO_PATH,
  PRICE_PER_RENDER_SECOND,
  PT_BR_DISCLOSURE,
  RENDER_SECONDS,
  STEP_KEY,
  VARIABLES_INPUT_SCHEMA,
  FAKE_STUDIO_ROOT,
  FAKE_TOOLS_DIR,
  chromeExecutablePath,
  createCompositionHarness,
  eventRecords,
  failureOf,
  hyperframesDetails,
  onlyRequest,
  readyEngineFiles,
  remotionDetails,
  scriptFixture,
  type CompositionHarness,
  type CompositionHarnessOptions,
} from './composition-stage.harness.test';

/*
 * Engine dispatch of the composition stage (SPEC 0008 sections 5.1 to 5.3): the Remotion request
 * is the pre-change golden (AC 71), a HyperFrames template only ever produces
 * `hyperframes-render`, mock mode renders the slate for either engine without touching the
 * HyperFrames ports (AC 74), and the request's variables follow section 5.3 (AC 78).
 */

describe('composition dispatch by template engine (AC 71)', () => {
  let harness: CompositionHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  async function open(options: CompositionHarnessOptions): Promise<CompositionHarness> {
    harness = await createCompositionHarness(options);
    return harness;
  }

  it('sends the pre-change Remotion request for a remotion template (golden)', async () => {
    const current = await open({ template: remotionDetails() });
    const script = scriptFixture();

    const result = await current.execute();

    assert.equal(result.status, 'reported-success');
    const request = onlyRequest(current.runner, 'render');
    const scratch = dirname(request.output);
    assert.equal(dirname(scratch), current.scratchRoot);
    assert.deepEqual(request, {
      command: 'render',
      serveRoot: join(scratch, 'serve'),
      template: 'PRODUCT_TOUR_16X9',
      title: script.title,
      durationS: 50,
      audioPath: 'narration.wav',
      scenes: [
        { id: 's1', kind: 'hook', startS: 0, endS: 20, onScreenText: 'Primeira cena', asset: null },
        { id: 's2', kind: 'cta', startS: 20, endS: 50, onScreenText: 'Segunda cena', asset: null },
      ],
      captions: [],
      disclosure: PT_BR_DISCLOSURE,
      output: join(scratch, 'composition.mp4'),
      thumbnail: join(scratch, 'thumbnail.png'),
    });
  });

  it('never consults the HyperFrames ports for a remotion template', async () => {
    const current = await open({ template: remotionDetails() });

    await current.execute();

    assert.deepEqual(current.ports.calls, []);
    assert.deepEqual(eventRecords(current.logs, 'hyperframes.render-finished'), []);
  });

  it('sends hyperframes-render and never render for a hyperframes template', async () => {
    const current = await open({ template: hyperframesDetails() });

    const result = await current.execute();

    assert.equal(result.status, 'reported-success');
    assert.deepEqual(
      current.runner.requests.map((request) => request.command),
      ['hyperframes-render'],
    );
  });

  it('does not send a hyperframes template whose compositionId is ToolDemo to Remotion', async () => {
    const current = await open({ template: hyperframesDetails({ compositionId: 'ToolDemo' }) });

    await current.execute();

    assert.deepEqual(
      current.runner.requests.map((request) => request.command),
      ['hyperframes-render'],
    );
  });

  it('does not fall back to Remotion when a ToolDemo-labelled hyperframes template is refused', async () => {
    const current = await open({ template: hyperframesDetails({ compositionId: 'ToolDemo' }) });
    current.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), engine: { status: 'absent' } });

    const result = await current.execute();

    assert.equal(failureOf(result).class, 'needs-person');
    assert.deepEqual(current.runner.requests, []);
  });
});

describe('mock mode renders the slate for either engine (AC 74)', () => {
  let harness: CompositionHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  async function assertSlateOnly(current: CompositionHarness): Promise<void> {
    const result = await current.execute();

    assert.equal(result.status, 'reported-success');
    const request = onlyRequest(current.runner, 'slate-render');
    assert.deepEqual(request, {
      command: 'slate-render',
      tools: { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' },
      width: 1920,
      height: 1080,
      fps: 30,
      durationS: 50,
      audio: join(current.runDir, NARRATION_AUDIO_PATH),
      output: join(dirname(request.output), 'composition.mp4'),
    });
    assert.equal(existsSync(current.compositionOutputPath), true);
  }

  it('renders the slate and reads no HyperFrames file for a hyperframes template while the engine is enabled', async () => {
    const current = await createCompositionHarness({ renderLive: false, template: hyperframesDetails() });
    harness = current;

    await assertSlateOnly(current);
    assert.deepEqual(current.ports.calls, []);
  });

  it('renders the slate and reads no HyperFrames file for a hyperframes template while the engine is disabled', async () => {
    const current = await createCompositionHarness({ renderLive: false, template: hyperframesDetails() });
    harness = current;
    current.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), engine: { status: 'absent' } });

    await assertSlateOnly(current);
    assert.deepEqual(current.ports.calls, []);
  });

  it('renders the slate for a remotion template', async () => {
    const current = await createCompositionHarness({ renderLive: false, template: remotionDetails() });
    harness = current;

    await assertSlateOnly(current);
    assert.deepEqual(current.ports.calls, []);
  });

  it('records no render cost and logs no HyperFrames event in mock mode', async () => {
    const current = await createCompositionHarness({ renderLive: false, template: hyperframesDetails() });
    harness = current;

    await current.execute();

    assert.deepEqual(current.ledger.records, []);
    assert.deepEqual(eventRecords(current.logs, 'hyperframes.render-finished'), []);
    assert.deepEqual(eventRecords(current.logs, 'hyperframes.render-refused'), []);
  });
});

describe('the default template engine (AC 73)', () => {
  it('keeps remotion as the default template engine', () => {
    assert.equal(DEFAULT_TEMPLATE_ENGINE, 'remotion');
  });
});

describe('a ready HyperFrames render (SPEC 0008 section 5.2)', () => {
  let harness: CompositionHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  it('stages the template copy in scratch and sends one hyperframes-render request the runner protocol accepts', async () => {
    const current = await createCompositionHarness();
    harness = current;
    const script = scriptFixture();

    await current.execute();

    const request = onlyRequest(current.runner, 'hyperframes-render');
    const scratch = request.scratchDir;
    const paths = hyperframesPaths(current.dataHomeRoot);
    assert.equal(dirname(scratch), current.scratchRoot);
    assert.match(basename(scratch), /^studio-stage-/);
    assert.deepEqual(current.runner.stagedTemplateFiles, [['index.html', 'style.css']]);
    assert.deepEqual(request, {
      command: 'hyperframes-render',
      tools: { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' },
      templateDir: join(scratch, 'template'),
      variables: { title: script.title, hook: script.hook, disclosure: PT_BR_DISCLOSURE, accent: BRAND_ACCENT, durationS: 50 },
      width: 1920,
      height: 1080,
      fps: 30,
      durationS: 50,
      audio: join(current.runDir, NARRATION_AUDIO_PATH),
      output: join(scratch, 'composition.mp4'),
      scratchDir: scratch,
      runtime: {
        binPath: FAKE_BIN_PATH,
        browserPath: chromeExecutablePath(current.dataHomeRoot),
        configDir: paths.configDir,
        cacheDir: paths.cacheDir,
        homeDir: paths.homeDir,
        sandboxProfilePath: FAKE_PROFILE.path,
        ownerConfigDir: join(current.ownerHome, '.hyperframes'),
        // SPEC 0008 section 17.5 (rev 2): the nine sandbox inputs, real paths from the harness ports.
        ownerHomeDir: current.ownerHome,
        studioRoot: FAKE_STUDIO_ROOT,
        dataHomeRoot: current.dataHomeRoot,
        hyperframesRoot: paths.root,
        chromeDir: join(paths.cacheDir, 'chrome'),
        ffmpegBin: join(FAKE_TOOLS_DIR, 'ffmpeg'),
        ffprobeBin: join(FAKE_TOOLS_DIR, 'ffprobe'),
        apiPort: 4311,
        webPort: 4310,
      },
    });
    assert.equal(HyperframesRenderRequestSchema.safeParse(request).success, true);
    assert.equal(ToolRunnerRequestSchema.safeParse(request).success, true);
  });

  it('adopts composition.mp4 into the run and reports success', async () => {
    const current = await createCompositionHarness();
    harness = current;

    const result = await current.execute();

    assert.deepEqual(result, { status: 'reported-success', summary: 'Composição de 50.0 s renderizada.', models: [] });
    assert.equal(await readFile(current.compositionOutputPath, 'utf8'), 'fake composition bytes');
  });

  it('records the render cost exactly as for Remotion', async () => {
    const current = await createCompositionHarness();
    harness = current;

    await current.execute();

    assert.equal(current.ledger.records.length, 1);
    const recorded = current.ledger.records[0];
    if (recorded === undefined || recorded.session.kind !== 'render') return assert.fail('expected one render cost session');
    assert.equal(recorded.runId, current.context.runId);
    assert.equal(recorded.runDir, current.runDir);
    assert.equal(recorded.session.provider, 'render');
    assert.equal(recorded.session.stepKey, STEP_KEY);
    assert.equal(recorded.session.renderSeconds, RENDER_SECONDS);
    assert.equal(recorded.session.usd, RENDER_SECONDS * PRICE_PER_RENDER_SECOND);
  });

  it('reports the HyperFrames render activity', async () => {
    const current = await createCompositionHarness();
    harness = current;

    await current.execute();

    assert.deepEqual(current.activities, [{ kind: 'tool', text: 'Renderizando o modelo hf-title-card@1 (HyperFrames).' }]);
  });

  it('removes the scratch copy once the render is adopted', async () => {
    const current = await createCompositionHarness();
    harness = current;

    await current.execute();

    const request = onlyRequest(current.runner, 'hyperframes-render');
    assert.equal(existsSync(request.scratchDir), false);
  });

  it('logs render-finished with the pin, ok, renderSeconds and variableCount', async () => {
    const current = await createCompositionHarness();
    harness = current;

    await current.execute();

    assert.deepEqual(eventRecords(current.logs, 'hyperframes.render-finished'), [
      {
        event: 'hyperframes.render-finished',
        runId: current.context.runId,
        stepKey: STEP_KEY,
        templateRef: HYPERFRAMES_TEMPLATE_REF,
        pin: HYPERFRAMES_PIN,
        ok: true,
        renderSeconds: RENDER_SECONDS,
        variableCount: 5,
      },
    ]);
  });

  it('turns a runner failure into a retryable tool failure that adopts nothing and records no cost', async () => {
    const current = await createCompositionHarness();
    harness = current;
    current.runner.reply = { status: 'failed', kind: 'tool', message: 'hyperframes-render failed (tool)' };

    const result = await current.execute();

    assert.deepEqual(failureOf(result), { class: 'retryable', kind: 'tool', message: 'A ferramenta local falhou: hyperframes-render failed (tool).' });
    assert.equal(existsSync(current.compositionOutputPath), false);
    assert.deepEqual(current.ledger.records, []);
    assert.deepEqual(
      eventRecords(current.logs, 'hyperframes.render-finished').map((event) => [event.ok, event.renderSeconds]),
      [[false, null]],
    );
  });
});

describe('template variables in the hyperframes-render request (AC 78)', () => {
  let harness: CompositionHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  async function variablesSent(options: CompositionHarnessOptions): Promise<Readonly<Record<string, string | number | boolean>>> {
    const current = await createCompositionHarness(options);
    harness = current;
    await current.execute();
    return onlyRequest(current.runner, 'hyperframes-render').variables;
  }

  it('prefers the recipe value over the studio vocabulary', async () => {
    const variables = await variablesSent({
      template: hyperframesDetails({ inputSchema: VARIABLES_INPUT_SCHEMA }),
      params: { templateVariables: { title: 'Titulo da receita', accent: '#00ff00' } },
    });

    assert.deepEqual(variables, {
      title: 'Titulo da receita',
      hook: scriptFixture().hook,
      disclosure: PT_BR_DISCLOSURE,
      durationS: 50,
      accent: '#00ff00',
    });
  });

  it('fills title, hook, disclosure, durationS and accent from the run when the recipe is silent', async () => {
    const variables = await variablesSent({ template: hyperframesDetails({ inputSchema: VARIABLES_INPUT_SCHEMA }) });

    assert.deepEqual(variables, {
      title: scriptFixture().title,
      hook: scriptFixture().hook,
      disclosure: PT_BR_DISCLOSURE,
      durationS: 50,
      accent: BRAND_ACCENT,
    });
  });

  it('sends a recipe value for a declared name outside the studio vocabulary', async () => {
    const variables = await variablesSent({
      template: hyperframesDetails({ inputSchema: VARIABLES_INPUT_SCHEMA }),
      params: { templateVariables: { tagline: 'Feito no estudio', showLogo: true } },
    });

    assert.deepEqual(variables, {
      title: scriptFixture().title,
      hook: scriptFixture().hook,
      disclosure: PT_BR_DISCLOSURE,
      durationS: 50,
      accent: BRAND_ACCENT,
      tagline: 'Feito no estudio',
      showLogo: true,
    });
  });

  it('leaves out a declared property with no value so the template default applies', async () => {
    const variables = await variablesSent({ template: hyperframesDetails({ inputSchema: VARIABLES_INPUT_SCHEMA }) });

    assert.equal(Object.hasOwn(variables, 'tagline'), false);
    assert.equal(Object.hasOwn(variables, 'showLogo'), false);
  });

  it('sends only the names the template declares', async () => {
    const variables = await variablesSent({
      template: hyperframesDetails({
        inputSchema: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string', maxLength: 120 } } },
      }),
    });

    assert.deepEqual(variables, { title: scriptFixture().title });
  });

  it('omits accent when no brand kit is bound', async () => {
    const variables = await variablesSent({ brandKit: false });

    assert.deepEqual(variables, {
      title: scriptFixture().title,
      hook: scriptFixture().hook,
      disclosure: PT_BR_DISCLOSURE,
      durationS: 50,
    });
  });
});
