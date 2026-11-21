import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { HYPERFRAMES_CHROME_VERSION, HYPERFRAMES_PIN } from '@studio/shared/hyperframes';
import { readEngineFile } from '@studio/shared/hyperframes/files';
import { ExitCode } from '../errors/exit-codes.js';
import {
  NOW,
  createFakePorts,
  createHyperframesStudio,
  passingTrace,
  rejectionOf,
  seedChrome,
  seedConfig,
  seedEngine,
  seedReadyFiles,
  seedTrace,
  type HyperframesTestStudio,
} from '../hyperframes/hyperframes-cli.harness.test.js';
import { HyperframesStepRefusedError } from '../hyperframes/hyperframes.errors.js';
import { hyperframesDisableCommand, hyperframesEnableCommand, hyperframesStatusCommand } from './hyperframes.command.js';

/*
 * `studio hyperframes status | enable | disable` (SPEC 0008 sections 5.6, 5.7 and 7, AC 70). The
 * gate files live in a temp data home; the sandbox check is the fake system port. The refusal texts
 * below are the section 5.7 table, typed out.
 */

const CHROME_MISSING_TEXT = 'O Chrome do HyperFrames não está instalado.';
const CONFIG_MISSING_TEXT = 'A pasta de configuração do HyperFrames não foi preparada.';
const TRACE_TEXT = 'A verificação de rede do HyperFrames não foi feita para esta versão.';

function lineWith(studio: HyperframesTestStudio, label: string): string {
  const line = studio.printer.lines.find((candidate) => candidate.includes(label));
  assert.ok(line !== undefined, `no status line for ${label}`);
  return line;
}

async function engineFileState(studio: HyperframesTestStudio): Promise<string> {
  const engine = await readEngineFile(studio.dataHomeRoot);
  return engine.status === 'present' ? engine.value.state : engine.status;
}

describe('studio hyperframes enable (SPEC 0008 section 5.6, AC 70)', () => {
  let studio: HyperframesTestStudio;

  beforeEach(async () => {
    studio = await createHyperframesStudio();
  });

  afterEach(async () => {
    await studio.remove();
  });

  async function expectRefusal(reasonText: string): Promise<void> {
    const fake = createFakePorts({ interactive: false });

    const error = await rejectionOf(hyperframesEnableCommand(fake.ports, studio.dependencies));

    assert.ok(error instanceof HyperframesStepRefusedError);
    assert.ok(error.message.includes(reasonText), error.message);
    assert.equal(existsSync(studio.paths.engineFile), false);
    assert.deepEqual(fake.events.events, []);
  }

  it('refuses with no hyperframes folder, names the first missing step and creates nothing', async () => {
    await expectRefusal(CHROME_MISSING_TEXT);

    assert.equal(existsSync(studio.paths.root), false);
  });

  it('refuses when Chrome is missing although the config and a pass trace exist', async () => {
    await seedConfig(studio);
    await seedTrace(studio);

    await expectRefusal(CHROME_MISSING_TEXT);
  });

  it('refuses when the binary chrome.json names was removed', async () => {
    const shellPath = await seedChrome(studio);
    await seedConfig(studio);
    await seedTrace(studio);
    await rm(shellPath);

    await expectRefusal(CHROME_MISSING_TEXT);
  });

  it('refuses when the config folder was not seeded', async () => {
    await seedChrome(studio);
    await seedTrace(studio);

    await expectRefusal(CONFIG_MISSING_TEXT);
  });

  it('refuses when no trace was run', async () => {
    await seedChrome(studio);
    await seedConfig(studio);

    await expectRefusal(TRACE_TEXT);
  });

  it('refuses when the trace failed', async () => {
    await seedChrome(studio);
    await seedConfig(studio);
    await seedTrace(studio, passingTrace({ result: 'fail', findings: ['rede negada: node network-outbound 203.0.113.7:443'], deniedNetwork: 1 }));

    await expectRefusal(TRACE_TEXT);
  });

  it('refuses a pass trace taken with another pin (trace-stale)', async () => {
    await seedChrome(studio);
    await seedConfig(studio);
    await seedTrace(studio, passingTrace({ pin: '0.9.71' }));

    await expectRefusal(TRACE_TEXT);
  });

  it('refuses a pass trace taken with another Chrome hash (trace-stale)', async () => {
    await seedChrome(studio);
    await seedConfig(studio);
    await seedTrace(studio, passingTrace({ chromeSha256: 'e'.repeat(64) }));

    await expectRefusal(TRACE_TEXT);
  });

  it('refuses a pass trace taken with another sandbox profile hash (trace-stale)', async () => {
    await seedChrome(studio);
    await seedConfig(studio);
    await seedTrace(studio, passingTrace({ profileSha256: 'f'.repeat(64) }));

    await expectRefusal(TRACE_TEXT);
  });

  it('refuses without the macOS sandbox even when every file is ready', async () => {
    await seedReadyFiles(studio);
    const fake = createFakePorts({ interactive: false });
    fake.system.sandboxAvailable = false;

    const error = await rejectionOf(hyperframesEnableCommand(fake.ports, studio.dependencies));

    assert.ok(error instanceof HyperframesStepRefusedError);
    assert.equal(existsSync(studio.paths.engineFile), false);
  });

  it('leaves a stored disabled engine.json disabled when it refuses', async () => {
    await seedChrome(studio);
    await seedConfig(studio);
    await seedEngine(studio, 'disabled');
    const fake = createFakePorts({ interactive: false });

    await rejectionOf(hyperframesEnableCommand(fake.ports, studio.dependencies));

    assert.equal(await engineFileState(studio), 'disabled');
  });

  it('writes engine.json enabled when Chrome, config and a covering pass trace are in place', async () => {
    await seedReadyFiles(studio);
    const fake = createFakePorts({ interactive: false });

    const exitCode = await hyperframesEnableCommand(fake.ports, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    const engine = await readEngineFile(studio.dataHomeRoot);
    assert.equal(engine.status, 'present');
    if (engine.status !== 'present') return;
    assert.equal(engine.value.state, 'enabled');
    assert.equal(engine.value.updatedAt, NOW.toISOString());
  });

  it('emits engine-changed with the enabled state only', async () => {
    await seedReadyFiles(studio);
    const fake = createFakePorts({ interactive: false });

    await hyperframesEnableCommand(fake.ports, studio.dependencies);

    assert.deepEqual(fake.events.events, [{ event: 'hyperframes.engine-changed', state: 'enabled' }]);
  });

  it('starts no process', async () => {
    await seedReadyFiles(studio);
    const fake = createFakePorts({ interactive: false });

    await hyperframesEnableCommand(fake.ports, studio.dependencies);

    assert.equal(fake.processAdaptersOpened(), 0);
  });
});

describe('studio hyperframes disable (SPEC 0008 section 5.6)', () => {
  let studio: HyperframesTestStudio;

  beforeEach(async () => {
    studio = await createHyperframesStudio();
  });

  afterEach(async () => {
    await studio.remove();
  });

  it('writes engine.json disabled on a data home with no hyperframes folder', async () => {
    const fake = createFakePorts({ interactive: false });

    const exitCode = await hyperframesDisableCommand(fake.ports, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    assert.equal(await engineFileState(studio), 'disabled');
  });

  it('turns an enabled, ready engine off', async () => {
    await seedReadyFiles(studio);
    await seedEngine(studio, 'enabled');
    const fake = createFakePorts({ interactive: false });

    const exitCode = await hyperframesDisableCommand(fake.ports, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    assert.equal(await engineFileState(studio), 'disabled');
  });

  it('replaces an invalid engine.json with a disabled one', async () => {
    await seedConfig(studio);
    await writeFile(studio.paths.engineFile, '{"state": "enabled"');
    const fake = createFakePorts({ interactive: false });

    const exitCode = await hyperframesDisableCommand(fake.ports, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    assert.equal(await engineFileState(studio), 'disabled');
  });

  it('works without the macOS sandbox', async () => {
    const fake = createFakePorts({ interactive: false });
    fake.system.sandboxAvailable = false;

    const exitCode = await hyperframesDisableCommand(fake.ports, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    assert.equal(await engineFileState(studio), 'disabled');
  });

  it('emits engine-changed with the disabled state only', async () => {
    const fake = createFakePorts({ interactive: false });

    await hyperframesDisableCommand(fake.ports, studio.dependencies);

    assert.deepEqual(fake.events.events, [{ event: 'hyperframes.engine-changed', state: 'disabled' }]);
  });

  it('still succeeds when the event cannot be recorded', async () => {
    const fake = createFakePorts({ interactive: false });
    fake.ports.events = {
      record: async () => {
        throw new Error('log unavailable');
      },
    };

    const exitCode = await hyperframesDisableCommand(fake.ports, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    assert.equal(await engineFileState(studio), 'disabled');
  });
});

describe('studio hyperframes status (SPEC 0008 section 7)', () => {
  let studio: HyperframesTestStudio;

  beforeEach(async () => {
    studio = await createHyperframesStudio();
  });

  afterEach(async () => {
    await studio.remove();
  });

  it('shows the pin, the Node version, and every step as missing on an empty data home', async () => {
    const fake = createFakePorts({ interactive: false });

    const exitCode = await hyperframesStatusCommand(fake.ports, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    assert.ok(studio.printer.lines.some((line) => line.includes(`HyperFrames: ${HYPERFRAMES_PIN}`)));
    assert.ok(lineWith(studio, 'Node para HyperFrames').includes(process.versions.node));
    assert.match(lineWith(studio, 'Chrome do HyperFrames'), /não instalado/);
    assert.match(lineWith(studio, 'configuração do HyperFrames'), /não preparada/);
    assert.match(lineWith(studio, 'verificação de rede'), /não feita/);
    assert.match(lineWith(studio, 'motor HyperFrames:'), /desligado/);
    assert.match(lineWith(studio, 'próximo passo do HyperFrames'), /studio hyperframes chrome install/);
  });

  it('reads only: it creates no hyperframes folder and starts nothing', async () => {
    const fake = createFakePorts({ interactive: false });

    await hyperframesStatusCommand(fake.ports, studio.dependencies);

    assert.equal(existsSync(studio.paths.root), false);
    assert.equal(fake.processAdaptersOpened(), 0);
    assert.deepEqual(fake.events.events, []);
  });

  it('shows Chrome installed, config prepared, the pass trace date and an engine that is on and ready', async () => {
    await seedReadyFiles(studio);
    await seedEngine(studio, 'enabled');
    const fake = createFakePorts({ interactive: false });

    await hyperframesStatusCommand(fake.ports, studio.dependencies);

    assert.ok(lineWith(studio, 'Chrome do HyperFrames').includes(HYPERFRAMES_CHROME_VERSION));
    assert.doesNotMatch(lineWith(studio, 'configuração do HyperFrames'), /não/);
    const traceLine = lineWith(studio, 'verificação de rede');
    assert.match(traceLine, /pass/);
    assert.ok(traceLine.includes(passingTrace().at));
    assert.match(lineWith(studio, 'motor HyperFrames:'), /ligado e pronto/);
    assert.match(lineWith(studio, 'próximo passo do HyperFrames'), /Nenhum/);
  });

  it('names enable as the next step when every file is ready and the engine is off', async () => {
    await seedReadyFiles(studio);
    const fake = createFakePorts({ interactive: false });

    await hyperframesStatusCommand(fake.ports, studio.dependencies);

    assert.match(lineWith(studio, 'motor HyperFrames:'), /desligado/);
    assert.match(lineWith(studio, 'próximo passo do HyperFrames'), /studio hyperframes enable/);
  });

  it('shows a failed trace with its date and names the trace as the next step', async () => {
    await seedChrome(studio);
    await seedConfig(studio);
    await seedTrace(studio, passingTrace({ result: 'fail', at: '2026-11-20T08:30:00.000Z', findings: ['rede negada'], deniedNetwork: 1 }));
    const fake = createFakePorts({ interactive: false });

    await hyperframesStatusCommand(fake.ports, studio.dependencies);

    const traceLine = lineWith(studio, 'verificação de rede');
    assert.match(traceLine, /fail/);
    assert.ok(traceLine.includes('2026-11-20T08:30:00.000Z'));
    assert.match(lineWith(studio, 'próximo passo do HyperFrames'), /studio hyperframes trace/);
  });

  it('flags a pass trace from another Chrome as stale', async () => {
    await seedChrome(studio);
    await seedConfig(studio);
    await seedTrace(studio, passingTrace({ chromeSha256: 'e'.repeat(64) }));
    const fake = createFakePorts({ interactive: false });

    await hyperframesStatusCommand(fake.ports, studio.dependencies);

    assert.doesNotMatch(lineWith(studio, 'verificação de rede'), /^\[ok\]/);
    assert.match(lineWith(studio, 'próximo passo do HyperFrames'), /studio hyperframes trace/);
  });

  it('shows the sandbox as unavailable when the macOS sandbox tool is missing', async () => {
    const fake = createFakePorts({ interactive: false });
    fake.system.sandboxAvailable = false;

    await hyperframesStatusCommand(fake.ports, studio.dependencies);

    assert.match(lineWith(studio, 'isolamento do macOS'), /indisponível/);
  });
});
