import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { pinnedBinPath, type HyperframesProcessRequest } from '@studio/hyperframes';
import { HYPERFRAMES_CHROME_VERSION } from '@studio/shared/hyperframes';
import { readChromeFile } from '@studio/shared/hyperframes/files';
import { CliError, TerminalRequiredError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import {
  NOW,
  PINNED_BUILD_FOLDER,
  ScriptedProcessPort,
  createFakePorts,
  createHyperframesStudio,
  rejectionOf,
  writePlaceholderShell,
  type HyperframesTestStudio,
} from '../hyperframes/hyperframes-cli.harness.test.js';
import { HyperframesConfirmationError } from '../hyperframes/hyperframes.errors.js';
import { hyperframesChromeInstallCommand } from './hyperframes-chrome.command.js';

/*
 * `studio hyperframes chrome install`, owner step O2 (SPEC 0008 section 5.5, AC 69, section 7).
 * The fake process port stands in for `browser ensure`: a hook plays the child's part by writing
 * placeholder files under the temp data home's `cache/chrome/`. Nothing is downloaded or started.
 */

const PROGRAM_SOURCE = fileURLToPath(new URL('../program/hyperframes-commands.ts', import.meta.url));
const SHELL_CONTENT = 'placeholder chrome bytes for the install test';

function sha256Of(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

interface EnsureObservation {
  configSeededAtEnsure: boolean | null;
}

/** A process port whose one run acts like `browser ensure`: it records the config state, then unpacks. */
function ensurePort(studio: HyperframesTestStudio, unpack: () => Promise<void>, exitCode = 0): { port: ScriptedProcessPort; observed: EnsureObservation } {
  const observed: EnsureObservation = { configSeededAtEnsure: null };
  const port = new ScriptedProcessPort([exitCode], async () => {
    observed.configSeededAtEnsure = existsSync(studio.paths.configFile);
    await unpack();
  });
  return { port, observed };
}

function onlyRequest(port: ScriptedProcessPort): HyperframesProcessRequest {
  assert.equal(port.requests.length, 1);
  const [request] = port.requests;
  assert.ok(request !== undefined);
  return request;
}

describe('studio hyperframes chrome install (SPEC 0008 section 5.5, AC 69)', () => {
  let studio: HyperframesTestStudio;

  beforeEach(async () => {
    studio = await createHyperframesStudio();
  });

  afterEach(async () => {
    await studio.remove();
  });

  describe('refusals', () => {
    it('refuses without a terminal, before asking, starting or writing anything', async () => {
      const fake = createFakePorts({ interactive: false, answers: [HYPERFRAMES_CHROME_VERSION] });

      const error = await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof TerminalRequiredError);
      assert.equal(fake.terminal.opened, 0);
      assert.equal(fake.processAdaptersOpened(), 0);
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.root), false);
      assert.deepEqual(fake.events.events, []);
    });

    it('refuses an empty typed answer and writes nothing', async () => {
      const fake = createFakePorts({ interactive: true, answers: [''] });

      const error = await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof HyperframesConfirmationError);
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.root), false);
      assert.deepEqual(fake.events.events, []);
    });

    it('refuses a wrong typed version and writes nothing', async () => {
      const fake = createFakePorts({ interactive: true, answers: ['158.0.8127.35'] });

      const error = await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof HyperframesConfirmationError);
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.root), false);
    });

    it('refuses a typed "yes" in place of the version', async () => {
      const fake = createFakePorts({ interactive: true, answers: ['sim'] });

      const error = await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof HyperframesConfirmationError);
      assert.equal(fake.processPort.requests.length, 0);
      assert.equal(existsSync(studio.paths.root), false);
    });

    it('announces build, size, host and destination before it asks for the version', async () => {
      const fake = createFakePorts({ interactive: true, answers: ['no'] });

      await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      const shown = studio.printer.text();
      assert.match(shown, new RegExp(HYPERFRAMES_CHROME_VERSION.replaceAll('.', '\\.')));
      assert.match(shown, /195 MB/);
      assert.match(shown, /storage\.googleapis\.com\/chrome-for-testing-public/);
      assert.ok(shown.includes(studio.paths.cacheDir));
      assert.equal(fake.terminal.questions.length, 1);
    });

    it('takes no option or argument, so no flag can supply the typed version', async () => {
      const source = await readFile(PROGRAM_SOURCE, 'utf8');

      assert.doesNotMatch(source, /\.(?:option|requiredOption|addOption|argument|arguments|addArgument|allowUnknownOption)\(/);
      assert.equal(hyperframesChromeInstallCommand.length, 2);
    });
  });

  describe('with the typed version', () => {
    it('seeds config/config.json before it runs browser ensure', async () => {
      const { port, observed } = ensurePort(studio, async () => {
        await writePlaceholderShell(studio, PINNED_BUILD_FOLDER, SHELL_CONTENT);
      });
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      await hyperframesChromeInstallCommand(fake.ports, studio.dependencies);

      assert.equal(observed.configSeededAtEnsure, true);
    });

    it('runs browser ensure once, unsandboxed, with the pinned bin and no browser path in the environment', async () => {
      const { port } = ensurePort(studio, async () => {
        await writePlaceholderShell(studio, PINNED_BUILD_FOLDER, SHELL_CONTENT);
      });
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      await hyperframesChromeInstallCommand(fake.ports, studio.dependencies);

      const request = onlyRequest(port);
      assert.equal(request.command, process.execPath);
      assert.deepEqual(request.args, [pinnedBinPath(), 'browser', 'ensure']);
      assert.equal(Object.hasOwn(request.env, 'HYPERFRAMES_BROWSER_PATH'), false);
      assert.equal(request.env['HYPERFRAMES_CACHE_DIR'], studio.paths.cacheDir);
      assert.equal(request.env['HYPERFRAMES_CONFIG_DIR'], studio.paths.configDir);
      assert.equal(request.env['HOME'], studio.paths.homeDir);
    });

    it('records the one pinned chrome-headless-shell in chrome.json with version, hash and size', async () => {
      let shellPath = '';
      const { port } = ensurePort(studio, async () => {
        shellPath = await writePlaceholderShell(studio, PINNED_BUILD_FOLDER, SHELL_CONTENT);
      });
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      const exitCode = await hyperframesChromeInstallCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.ok);
      const chrome = await readChromeFile(studio.dataHomeRoot);
      assert.equal(chrome.status, 'present');
      if (chrome.status !== 'present') return;
      assert.equal(chrome.value.version, HYPERFRAMES_CHROME_VERSION);
      assert.equal(chrome.value.sha256, sha256Of(SHELL_CONTENT));
      assert.equal(chrome.value.sizeBytes, Buffer.byteLength(SHELL_CONTENT));
      assert.equal(chrome.value.executablePath, shellPath);
      assert.equal(chrome.value.installedAt, NOW.toISOString());
    });

    it('accepts the typed version with surrounding spaces', async () => {
      const { port } = ensurePort(studio, async () => {
        await writePlaceholderShell(studio, PINNED_BUILD_FOLDER, SHELL_CONTENT);
      });
      const fake = createFakePorts({ interactive: true, answers: [`  ${HYPERFRAMES_CHROME_VERSION}  `], processPort: port });

      const exitCode = await hyperframesChromeInstallCommand(fake.ports, studio.dependencies);

      assert.equal(exitCode, ExitCode.ok);
      assert.equal((await readChromeFile(studio.dataHomeRoot)).status, 'present');
    });

    it('emits chrome-installed with version and sizeBytes only, never a path', async () => {
      const { port } = ensurePort(studio, async () => {
        await writePlaceholderShell(studio, PINNED_BUILD_FOLDER, SHELL_CONTENT);
      });
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      await hyperframesChromeInstallCommand(fake.ports, studio.dependencies);

      assert.deepEqual(fake.events.events, [
        { event: 'hyperframes.chrome-installed', version: HYPERFRAMES_CHROME_VERSION, sizeBytes: Buffer.byteLength(SHELL_CONTENT) },
      ]);
      assert.equal(JSON.stringify(fake.events.events).includes(studio.root), false);
    });

    it('fails and writes no chrome.json when browser ensure leaves no chrome-headless-shell', async () => {
      const { port } = ensurePort(studio, async () => {
        // The child exits 0 but unpacks nothing.
      });
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      const error = await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof CliError);
      assert.equal(error.category, 'conflict');
      assert.equal(existsSync(studio.paths.chromeFile), false);
      assert.deepEqual(fake.events.events, []);
    });

    it('fails and writes no chrome.json when two chrome-headless-shell files are found', async () => {
      const { port } = ensurePort(studio, async () => {
        await writePlaceholderShell(studio, PINNED_BUILD_FOLDER, SHELL_CONTENT);
        await writePlaceholderShell(studio, `${PINNED_BUILD_FOLDER}-copy`, SHELL_CONTENT);
      });
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      const error = await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof CliError);
      assert.equal(error.category, 'conflict');
      assert.equal(existsSync(studio.paths.chromeFile), false);
      assert.deepEqual(fake.events.events, []);
    });

    it('fails and writes no chrome.json when the only chrome-headless-shell is another version', async () => {
      const { port } = ensurePort(studio, async () => {
        await writePlaceholderShell(studio, 'mac_arm-157.0.7000.0', SHELL_CONTENT);
      });
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      const error = await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof CliError);
      assert.equal(error.category, 'conflict');
      assert.equal(existsSync(studio.paths.chromeFile), false);
      assert.deepEqual(fake.events.events, []);
    });

    it('fails and writes no chrome.json when browser ensure exits non-zero', async () => {
      const { port } = ensurePort(
        studio,
        async () => {
          await writePlaceholderShell(studio, PINNED_BUILD_FOLDER, SHELL_CONTENT);
        },
        1,
      );
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      const error = await rejectionOf(hyperframesChromeInstallCommand(fake.ports, studio.dependencies));

      assert.ok(error instanceof CliError);
      assert.equal(error.category, 'dependency');
      assert.equal(existsSync(studio.paths.chromeFile), false);
      assert.deepEqual(fake.events.events, []);
    });

    it('builds every process path from the temp data home, never the real home or cache', async () => {
      const { port } = ensurePort(studio, async () => {
        await writePlaceholderShell(studio, PINNED_BUILD_FOLDER, SHELL_CONTENT);
      });
      const fake = createFakePorts({ interactive: true, answers: [HYPERFRAMES_CHROME_VERSION], processPort: port });

      await hyperframesChromeInstallCommand(fake.ports, studio.dependencies);

      const request = onlyRequest(port);
      for (const key of ['HOME', 'HYPERFRAMES_CONFIG_DIR', 'HYPERFRAMES_CACHE_DIR']) {
        const value = request.env[key];
        assert.ok(value !== undefined && value.startsWith(`${studio.dataHomeRoot}/`), key);
      }
      // The child's scratch folder is a fresh OS temp folder, never a folder of the owner's home.
      assert.ok(request.env['TMPDIR']?.startsWith(tmpdir()));
      assert.ok(request.cwd.startsWith(`${studio.dataHomeRoot}/`));
    });
  });
});
