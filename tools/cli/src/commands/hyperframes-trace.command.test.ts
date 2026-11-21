import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { SANDBOX_EXEC_PATH, sandboxProfile, type HyperframesProcessRequest } from '@studio/hyperframes';
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
import {
  TRACE_CHROME_CHANGED_AFTER_TEXT,
  TRACE_CHROME_UNREADABLE_AFTER_TEXT,
  TRACE_PROBE_FILE_REMOVED_TEXT,
  traceChromeBeforeText,
  traceInformationalDenialText,
} from '../hyperframes/hyperframes-texts.js';
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

type RunHook = (request: HyperframesProcessRequest) => Promise<void>;

/**
 * Fake ports for a confirmed trace; `exitCodes` answers C1 to C5, then the render (unscripted starts
 * exit 0). `onRun` acts like the child at each start, before its exit code is answered.
 */
function confirmedPorts(exitCodes: readonly number[] = [], onRun: RunHook | null = null): FakeHyperframesPorts {
  return createFakePorts({ interactive: true, answers: [CONFIRMATION], processPort: new ScriptedProcessPort(exitCodes, onRun) });
}

/** The order of the six starts of a trace (SPEC 0008 section 17.9): C1 to C5, then the render. */
const START = { C1: 0, C2: 1, C3: 2, C4: 3, C5: 4, render: 5 } as const;
const PROBED_CONTROLS = ['C2', 'C3', 'C4', 'C5'] as const;
/** Exit code of a control whose operation worked, i.e. the sandbox did not refuse it. */
const NOT_REFUSED = 10;
const CONTROL_TIMED_OUT = 11;

/** A hook that runs `action` at the given start only (0-based, see `START`). */
function atStart(startIndex: number, action: RunHook): RunHook {
  let started = 0;
  return async (request) => {
    const current = started;
    started += 1;
    if (current === startIndex) await action(request);
  };
}

/** Exit codes for C1 to C5 that refuse every control except `startIndex`, which answers `exitCode`. */
function controlExitCodes(startIndex: number, exitCode: number): number[] {
  return [START.C1, START.C2, START.C3, START.C4, START.C5].map((index) => (index === startIndex ? exitCode : 0));
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Same size as before, one byte different. */
async function changeOneByte(file: string): Promise<Buffer> {
  const bytes = await readFile(file);
  bytes.writeUInt8(bytes.readUInt8(0) ^ 0x01, 0);
  await writeFile(file, bytes);
  return bytes;
}

/** Same bytes as before, plus one. */
async function appendOneByte(file: string): Promise<Buffer> {
  const bytes = Buffer.concat([await readFile(file), Buffer.from('x')]);
  await writeFile(file, bytes);
  return bytes;
}

const BINARY_CHANGES: readonly { name: string; change: (file: string) => Promise<Buffer> }[] = [
  { name: 'its size differs', change: appendOneByte },
  { name: 'one byte differs at the same size', change: changeOneByte },
];

/** The `-f` and `-D` arguments of a start: everything before the node path (the `NODE_BIN` value). */
function sandboxArgumentPrefix(args: readonly string[]): readonly string[] {
  const nodeBinArgument = args.find((argument) => argument.startsWith('NODE_BIN='));
  assert.ok(nodeBinArgument !== undefined, 'no NODE_BIN parameter');
  const nodeIndex = args.indexOf(nodeBinArgument.slice('NODE_BIN='.length));
  assert.ok(nodeIndex > 0, 'the node path is not in the argument list');
  return args.slice(0, nodeIndex);
}

/** A value a run hook observes during the command; read after the command returns. */
interface Observed<Value> {
  value: Value | null;
}

/** The target of a control start: its last argument (targets reach the script as arguments). */
function controlTarget(request: HyperframesProcessRequest): string {
  const target = request.args.at(-1);
  assert.ok(target !== undefined, 'a control start without arguments');
  return target;
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

    it('runs the five controls under the sandbox first, then one sandboxed render, and probes the output', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      // SPEC 0008 section 17.9 (rev 2): controls C1 to C5, each one `node -e`, then the render.
      const requests = fake.processPort.requests;
      assert.equal(requests.length, 6);
      const controls = requests.slice(0, 5);
      const render = requests[5];
      for (const control of controls) {
        assert.equal(control.command, SANDBOX_EXEC_PATH);
        assert.ok(control.args.includes('-e'));
        assert.equal(control.args.includes('render'), false);
      }
      assert.ok(render !== undefined);
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

      const render = fake.processPort.requests.at(-1);
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
      // C1 to C5 refused (exit 0), then the render exits 3.
      const fake = confirmedPorts([0, 0, 0, 0, 0, 3]);

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

  describe('Chrome integrity (SPEC 0008 section 17.9, AC 92)', () => {
    for (const { name, change } of BINARY_CHANGES) {
      it(`refuses with the chrome-missing text, starts no process and writes no trace.json when ${name} from chrome.json`, async () => {
        const shellPath = await seedChrome(studio);
        await seedConfig(studio);
        await change(shellPath);
        const fake = confirmedPorts();

        const error = await rejectionOf(hyperframesTraceCommand(fake.ports, studio.dependencies));

        assert.ok(error instanceof HyperframesStepRefusedError);
        assert.ok(error.message.includes(CHROME_MISSING_TEXT));
        assert.equal(fake.processPort.requests.length, 0);
        assert.equal(fake.processAdaptersOpened(), 0);
        assert.equal(existsSync(studio.paths.traceFile), false);
        assert.deepEqual(fake.events.events, []);
      });
    }

    it('records as chromeSha256 the hash of the binary bytes after the render, not the chrome.json value', async () => {
      const shellPath = await seedChrome(studio);
      await seedConfig(studio);
      const bytesAfterRender: Observed<Buffer> = { value: null };
      const fake = confirmedPorts(
        [],
        atStart(START.render, async () => {
          bytesAfterRender.value = await changeOneByte(shellPath);
        }),
      );

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.ok(bytesAfterRender.value !== null, 'the render was not started');
      const trace = await storedTrace(studio);
      assert.equal(trace.chromeSha256, sha256Hex(bytesAfterRender.value));
      assert.notEqual(trace.chromeSha256, SEEDED_CHROME_SHA256);
    });

    it('records the hash of the unchanged binary bytes when nothing changed', async () => {
      const shellPath = await seedChrome(studio);
      await seedConfig(studio);
      const fake = confirmedPorts();

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'pass');
      assert.equal(trace.chromeSha256, sha256Hex(await readFile(shellPath)));
    });

    for (const { name, change } of BINARY_CHANGES) {
      it(`fails with a finding when the binary changes during the render and ${name}`, async () => {
        const shellPath = await seedChrome(studio);
        await seedConfig(studio);
        const fake = confirmedPorts(
          [],
          atStart(START.render, async () => {
            await change(shellPath);
          }),
        );

        const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

        assert.equal(exitCode, ExitCode.unhealthy);
        const trace = await storedTrace(studio);
        assert.equal(trace.result, 'fail');
        assert.equal(trace.renderExitCode, 0);
        assert.ok(trace.findings.includes(TRACE_CHROME_CHANGED_AFTER_TEXT));
        assert.ok(studio.printer.text().includes(TRACE_CHROME_CHANGED_AFTER_TEXT));
      });
    }

    it('writes a failing record with a zero hash and the finding when the binary is unreadable after the render (AC 99)', async () => {
      const shellPath = await seedChrome(studio);
      await seedConfig(studio);
      const fake = confirmedPorts(
        [],
        atStart(START.render, async () => {
          await rm(shellPath);
        }),
      );

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.unhealthy);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.equal(trace.renderExitCode, 0);
      assert.equal(trace.chromeSha256, '0'.repeat(64));
      assert.ok(trace.findings.includes(TRACE_CHROME_UNREADABLE_AFTER_TEXT));
      assert.equal(trace.findings.includes(TRACE_CHROME_CHANGED_AFTER_TEXT), false);
    });

    it('fails with a finding and starts no render when the binary changes after the verification, before the render', async () => {
      const shellPath = await seedChrome(studio);
      await seedConfig(studio);
      const changedBytes: Observed<Buffer> = { value: null };
      const fake = confirmedPorts(
        [],
        atStart(START.C5, async () => {
          changedBytes.value = await changeOneByte(shellPath);
        }),
      );

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.unhealthy);
      assert.ok(changedBytes.value !== null, 'C5 was not started');
      assert.equal(fake.processPort.requests.length, 5);
      assert.equal(
        fake.processPort.requests.some((request) => request.args.includes('render')),
        false,
      );
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.notEqual(trace.renderExitCode, 0);
      assert.ok(trace.findings.includes(traceChromeBeforeText('changed')));
      assert.equal(trace.chromeSha256, sha256Hex(changedBytes.value));
      assert.deepEqual(fake.system.probedFiles, []);
    });
  });

  describe('trace controls (SPEC 0008 section 17.9, AC 93)', () => {
    it('starts C1 to C5 and the render with the same -f and -D arguments, each followed by the node path', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const requests = fake.processPort.requests;
      assert.equal(requests.length, 6);
      const render = requests[START.render];
      assert.ok(render !== undefined);
      const renderPrefix = sandboxArgumentPrefix(render.args);
      // `-f <profile>` and the seventeen `-D NAME=value` pairs of section 17.5.
      assert.equal(renderPrefix.length, 36);
      assert.deepEqual(
        renderPrefix.filter((_, index) => index % 2 === 0),
        ['-f', ...Array.from({ length: 17 }, () => '-D')],
      );
      for (const [index, request] of requests.entries()) {
        assert.deepEqual(sandboxArgumentPrefix(request.args), renderPrefix, `start ${index}`);
      }
      for (const control of requests.slice(START.C1, START.render)) {
        assert.equal(control.args[renderPrefix.length + 1], '-e');
      }
    });

    it('passes when C2 to C5 are all refused (exit 0) besides the rev 1 conditions', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts([0, 0, 0, 0, 0, 0]);

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.ok);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'pass');
      assert.deepEqual(trace.findings, []);
    });

    for (const control of PROBED_CONTROLS) {
      it(`fails with a finding naming ${control} when ${control} is not refused`, async () => {
        await seedPrerequisites(studio);
        const fake = confirmedPorts(controlExitCodes(START[control], NOT_REFUSED));

        const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

        assert.equal(exitCode, ExitCode.unhealthy);
        const trace = await storedTrace(studio);
        assert.equal(trace.result, 'fail');
        // `controlDenied` keeps its rev 1 meaning: C1 denied and logged.
        assert.equal(trace.controlDenied, true);
        const named = trace.findings.filter((finding) => finding.startsWith(`controle ${control}:`));
        assert.equal(named.length, 1);
        assert.ok(named[0]?.includes(String(NOT_REFUSED)));
        for (const other of PROBED_CONTROLS.filter((id) => id !== control)) {
          assert.equal(
            trace.findings.some((finding) => finding.startsWith(`controle ${other}:`)),
            false,
            other,
          );
        }
      });
    }

    it('fails with a finding naming C5 when the C5 connection timed out instead of being refused', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts(controlExitCodes(START.C5, CONTROL_TIMED_OUT));

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.ok(trace.findings.some((finding) => finding.startsWith('controle C5:') && finding.includes(String(CONTROL_TIMED_OUT))));
    });

    it('removes and reports a file left by C3, and fails', async () => {
      await seedPrerequisites(studio);
      const probeFile: Observed<string> = { value: null };
      const fake = confirmedPorts(
        controlExitCodes(START.C3, NOT_REFUSED),
        atStart(START.C3, async (request) => {
          probeFile.value = controlTarget(request);
          await writeFile(probeFile.value, '');
        }),
      );

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.unhealthy);
      assert.ok(probeFile.value !== null, 'C3 was not started');
      assert.equal(dirname(probeFile.value), studio.paths.root);
      assert.equal(existsSync(probeFile.value), false);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'fail');
      assert.ok(trace.findings.includes(TRACE_PROBE_FILE_REMOVED_TEXT));
      assert.ok(studio.printer.text().includes(TRACE_PROBE_FILE_REMOVED_TEXT));
    });

    it('removes and reports a file left by C3 even when C3 exited as refused', async () => {
      await seedPrerequisites(studio);
      const probeFile: Observed<string> = { value: null };
      const fake = confirmedPorts(
        [],
        atStart(START.C3, async (request) => {
          probeFile.value = controlTarget(request);
          await writeFile(probeFile.value, '');
        }),
      );

      await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.ok(probeFile.value !== null, 'C3 was not started');
      assert.equal(existsSync(probeFile.value), false);
      const trace = await storedTrace(studio);
      assert.ok(trace.findings.includes(TRACE_PROBE_FILE_REMOVED_TEXT));
    });

    it('lists non-network denials no control caused as informational findings and still passes', async () => {
      await seedPrerequisites(studio);
      const fake = confirmedPorts();
      const machLookup: SandboxDenial = { process: 'chrome-headless-shell', operation: 'mach-lookup', target: 'com.example.unlisted-service' };
      const preferenceRead: SandboxDenial = { process: 'node', operation: 'file-read-data', target: '/Library/Preferences/com.example.plist' };
      fake.system.logRead = { status: 'read', denials: [controlDenial(), machLookup, preferenceRead] };

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.ok);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'pass');
      assert.equal(trace.deniedNetwork, 0);
      const expected = [
        traceInformationalDenialText('chrome-headless-shell mach-lookup com.example.unlisted-service'),
        traceInformationalDenialText('node file-read-data /Library/Preferences/com.example.plist'),
      ];
      assert.deepEqual(trace.findings, expected);
      for (const finding of expected) assert.ok(studio.printer.text().includes(finding));
    });

    it('does not report the denials caused by C2 to C5 as findings and still passes', async () => {
      await seedPrerequisites(studio);
      const apiPort = studio.dependencies.settings.ports.api;
      const system: Observed<FakeHyperframesPorts['system']> = { value: null };
      const fake = confirmedPorts(
        [],
        atStart(START.C3, async (request) => {
          // The C3 target is random; the log is read after the controls, so it can name it here.
          if (system.value === null) throw new Error('fake ports not ready');
          system.value.logRead = {
            status: 'read',
            denials: [
              controlDenial(),
              { process: 'node', operation: 'process-exec*', target: '/usr/bin/true' },
              { process: 'node', operation: 'file-write-create', target: controlTarget(request) },
              { process: 'node', operation: 'file-read-data', target: studio.dataHomeRoot },
              { process: 'node', operation: 'network-outbound', target: `127.0.0.1:${apiPort}` },
            ],
          };
        }),
      );
      system.value = fake.system;

      const exitCode = await hyperframesTraceCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.ok);
      const trace = await storedTrace(studio);
      assert.equal(trace.result, 'pass');
      assert.equal(trace.deniedNetwork, 0);
      assert.deepEqual(trace.findings, []);
    });
  });
});
