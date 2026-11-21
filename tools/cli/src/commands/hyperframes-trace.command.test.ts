import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { SANDBOX_EXEC_PATH, sandboxProfile } from '@studio/hyperframes';
import { HYPERFRAMES_PIN, type HyperframesTraceFile } from '@studio/shared/hyperframes';
import { readTraceFile } from '@studio/shared/hyperframes/files';
import { CliError, TerminalRequiredError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import {
  CONTROL_TARGET,
  NOW,
  SEEDED_CHROME_SHA256,
  ScriptedProcessPort,
  controlDenial,
  createFakePorts,
  createHyperframesStudio,
  goodProbe,
  rejectionOf,
  seedChrome,
  seedConfig,
  type FakeHyperframesPorts,
  type HyperframesTestStudio,
} from '../hyperframes/hyperframes-cli.harness.test.js';
import { type SandboxDenial } from '../hyperframes/hyperframes-ports.js';
import { HyperframesConfirmationError, HyperframesStepRefusedError } from '../hyperframes/hyperframes.errors.js';
import { hyperframesTraceCommand } from './hyperframes-trace.command.js';

/*
 * `studio hyperframes trace`, owner step O3 (SPEC 0008 section 5.6, section 7). The fake process
 * port answers the control and the render with scripted exit codes; the fake system port answers
 * the sandbox check, the log read and ffprobe. Nothing is started: the sandbox tool, the log tool and
 * the browser are only names in the recorded requests.
 */

const CONFIRMATION = 'verificar';
const CHROME_MISSING_TEXT = 'O Chrome do HyperFrames não está instalado.';
const CONFIG_MISSING_TEXT = 'A pasta de configuração do HyperFrames não foi preparada.';
const FOREIGN_TARGET = '203.0.113.7:443';

function networkDenial(target: string): SandboxDenial {
  return { process: 'node', operation: 'network-outbound', target };
}

/** Chrome recorded and the config seeded: the trace's two prerequisites. */
async function seedPrerequisites(studio: HyperframesTestStudio): Promise<void> {
  await seedChrome(studio);
  await seedConfig(studio);
}

/** Fake ports for a confirmed trace; `exitCodes` answers the control, then the render. */
function confirmedPorts(exitCodes: readonly number[] = [0, 0]): FakeHyperframesPorts {
  return createFakePorts({ interactive: true, answers: [CONFIRMATION], processPort: new ScriptedProcessPort(exitCodes) });
}

async function storedTrace(studio: HyperframesTestStudio): Promise<HyperframesTraceFile> {
  const trace = await readTraceFile(studio.dataHomeRoot);
  assert.equal(trace.status, 'present');
  if (trace.status !== 'present') throw new Error('trace.json is not present');
  return trace.value;
}

describe('studio hyperframes trace (SPEC 0008 section 5.6)', () => {
  let studio: HyperframesTestStudio;

  beforeEach(async () => {
    studio = await createHyperframesStudio();
  });

  afterEach(async () => {
    await studio.remove();
  });

  describe('refusals', () => {
    it('refuses without a terminal and starts or writes nothing', async () => {
      await seedPrerequisites(studio);
      const fake = createFakePorts({ interactive: false, answers: [CONFIRMATION] });

      const error = await rejectionOf(hyperframesTraceCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof TerminalRequiredError);
      assert.equal(fake.terminal.opened, 0);
      assert.equal(fake.processAdaptersOpened(), 0);
      assert.equal(fake.processPort.requests.length, 0);
      assert.deepEqual(fake.system.logWindows, []);
      assert.equal(existsSync(studio.paths.traceFile), false);
    });

    it('refuses a wrong typed confirmation and starts or writes nothing', async () => {
      await seedPrerequisites(studio);
      const fake = createFakePorts({ interactive: true, answers: ['sim'] });

      const error = await rejectionOf(hyperframesTraceCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof HyperframesConfirmationError);
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.traceFile), false);
      assert.deepEqual(fake.events.events, []);
    });

    it('refuses an empty typed confirmation and starts or writes nothing', async () => {
      await seedPrerequisites(studio);
      const fake = createFakePorts({ interactive: true, answers: [''] });

      const error = await rejectionOf(hyperframesTraceCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof HyperframesConfirmationError);
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.traceFile), false);
    });

    it('refuses when Chrome is not installed, before asking anything', async () => {
      await seedConfig(studio);
      const fake = confirmedPorts();

      const error = await rejectionOf(hyperframesTraceCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof HyperframesStepRefusedError);
      assert.ok(error.message.includes(CHROME_MISSING_TEXT));
      assert.equal(fake.terminal.opened, 0);
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.traceFile), false);
    });

    it('refuses when chrome.json names a binary that is no longer there', async () => {
      const shellPath = await seedChrome(studio);
      await seedConfig(studio);
      await rm(shellPath);
      const fake = confirmedPorts();

      const error = await rejectionOf(hyperframesTraceCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof HyperframesStepRefusedError);
      assert.ok(error.message.includes(CHROME_MISSING_TEXT));
      assert.equal(fake.processPort.requests.length, 0);
    });

    it('refuses when the config folder was not seeded, before asking anything', async () => {
      await seedChrome(studio);
      const fake = confirmedPorts();

      const error = await rejectionOf(hyperframesTraceCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof HyperframesStepRefusedError);
      assert.ok(error.message.includes(CONFIG_MISSING_TEXT));
      assert.equal(fake.terminal.opened, 0);
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.traceFile), false);
    });

    it('refuses without the macOS sandbox and starts nothing', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      fake.system.sandboxAvailable = false;

      const error = await rejectionOf(hyperframesTraceCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof CliError);
      assert.equal(error.category, 'dependency');
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.traceFile), false);
    });
  });

  describe('a confirmed trace', () => {
    it('writes a pass trace.json when the control is denied and logged, the render exits 0, the output is correct and nothing else was denied', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.ok);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'pass');
      assert.equal(trace.controlDenied, true);
      assert.equal(trace.renderExitCode, 0);
      assert.equal(trace.outputOk, true);
      assert.equal(trace.deniedNetwork, 0);
      assert.deepEqual(trace.findings, []);
      assert.equal(trace.pin, HYPERFRAMES_PIN);
      assert.equal(trace.chromeSha256, SEEDED_CHROME_SHA256);
      assert.equal(trace.profileSha256, sandboxProfile().sha256);
      assert.match(trace.templateContentHash, /^[0-9a-f]{64}$/);
      assert.equal(trace.at, NOW.toISOString());
    });

    it('runs the control under the sandbox first, then one sandboxed render, and probes the output', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const [control, render] = fake.processPort.requests;
      assert.equal(fake.processPort.requests.length, 2);
      assert.ok(control !== undefined && render !== undefined);
      assert.equal(control.command, SANDBOX_EXEC_PATH);
      assert.ok(control.args.includes('-e'));
      assert.equal(control.args.includes('render'), false);
      assert.equal(render.command, SANDBOX_EXEC_PATH);
      assert.ok(render.args.includes('render'));
      assert.ok(render.args.includes('--strict'));
      assert.equal(fake.system.probedFiles.length, 1);
      assert.equal(fake.system.logWindows.length, 1);
    });

    it('names the owner folder for the sandbox from the temp home and keeps every runtime path in the temp data home', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const [, render] = fake.processPort.requests;
      assert.ok(render !== undefined);
      assert.ok(render.args.includes(`OWNER_HYPERFRAMES_DIR=${join(studio.homeDirectory, '.hyperframes')}`));
      for (const key of ['HOME', 'HYPERFRAMES_CONFIG_DIR', 'HYPERFRAMES_CACHE_DIR', 'HYPERFRAMES_BROWSER_PATH']) {
        const value = render.env[key];
        assert.ok(value !== undefined && value.startsWith(`${studio.dataHomeRoot}/`), key);
      }
    });

    it('emits trace-finished with result, deniedNetwork and controlDenied only', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.deepEqual(fake.events.events, [{ event: 'hyperframes.trace-finished', result: 'pass', deniedNetwork: 0, controlDenied: true }]);
    });

    it('fails, never passes, when the control connection was not denied', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts([12, 0]);

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.unhealthy);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.controlDenied, false);
      assert.ok(trace.findings.some((finding) => finding.includes(CONTROL_TARGET)));
    });

    it('is invalid, never passed, when the control denial does not show in the system log', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      fake.system.logRead = { status: 'read', denials: [] };

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.unhealthy);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.controlDenied, false);
      assert.equal(trace.findings.length, 1);
      assert.deepEqual(fake.events.events, [{ event: 'hyperframes.trace-finished', result: 'fail', deniedNetwork: 0, controlDenied: false }]);
    });

    it('fails, never passes, when the system log cannot be read', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      fake.system.logRead = { status: 'unavailable' };

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.controlDenied, false);
      assert.ok(trace.findings.length > 0);
    });

    it('fails with a finding when the render exits non-zero, and does not probe a picture', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts([0, 3]);

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.unhealthy);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.renderExitCode, 3);
      assert.equal(trace.outputOk, false);
      assert.ok(trace.findings.some((finding) => finding.includes('3')));
      assert.deepEqual(fake.system.probedFiles, []);
    });

    it('fails with a finding when the rendered picture has the wrong codec', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      fake.system.probeRead = { status: 'read', probe: { ...goodProbe(), codec: 'hevc' } };

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.outputOk, false);
      assert.ok(trace.findings.some((finding) => finding.includes('hevc')));
    });

    it('fails with a finding when the rendered picture is not the template size', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      fake.system.probeRead = { status: 'read', probe: { ...goodProbe(), width: 1920, height: 1080 } };

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.outputOk, false);
      assert.ok(trace.findings.length > 0);
    });

    it('fails when ffprobe cannot read the rendered picture', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      fake.system.probeRead = { status: 'unavailable' };

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.outputOk, false);
    });

    it('fails and names the target when one network denial besides the control was logged', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      fake.system.logRead = { status: 'read', denials: [controlDenial(), networkDenial(FOREIGN_TARGET)] };

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.unhealthy);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.controlDenied, true);
      assert.equal(trace.deniedNetwork, 1);
      assert.ok(trace.findings.some((finding) => finding.includes(FOREIGN_TARGET)));
      assert.ok(studio.printer.text().includes(FOREIGN_TARGET));
    });

    it('never puts finding text in the trace-finished event', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      fake.system.logRead = { status: 'read', denials: [controlDenial(), networkDenial(FOREIGN_TARGET)] };

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.deepEqual(fake.events.events, [{ event: 'hyperframes.trace-finished', result: 'fail', deniedNetwork: 1, controlDenied: true }]);
      assert.equal(JSON.stringify(fake.events.events).includes(FOREIGN_TARGET), false);
    });

    it('stores at most 20 findings of at most 200 characters each, and shows every finding on screen', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      const longHost = `${'h'.repeat(300)}.example`;
      const extra = Array.from({ length: 25 }, (_, index) => networkDenial(`${longHost}-${index}:443`));
      fake.system.logRead = { status: 'read', denials: [controlDenial(), ...extra] };

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.deniedNetwork, 25);
      assert.equal(trace.findings.length, 20);
      for (const finding of trace.findings) assert.ok(finding.length <= 200, `${finding.length} characters`);
      const shownFindings = studio.printer.lines.filter((line) => line.includes(longHost));
      assert.equal(shownFindings.length, 25);
    });

    it('fails with a finding when config/ holds a file whose name starts with credentials', async () => {
      await seedPrerequisites(studio);
      await writeFile(join(studio.paths.configDir, 'credentials.json'), '{}\n');
      const fake = confirmedPorts();

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.unhealthy);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.ok(trace.findings.some((finding) => finding.includes('credentials')));
    });

    it('counts denied reads of the owner ~/.hyperframes folder', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      const ownerFile = join(studio.homeDirectory, '.hyperframes', 'config.json');
      fake.system.logRead = { status: 'read', denials: [controlDenial(), { process: 'node', operation: 'file-read-data', target: ownerFile }] };

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const trace = await storedTrace(studio);
      assert.equal(trace.ownerConfigDirDenied, 1);
      assert.equal(trace.deniedNetwork, 0);
    });
  });
});
