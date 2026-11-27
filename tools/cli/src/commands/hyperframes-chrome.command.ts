import { checkInstallRuntime, completeInstallRuntime, ensureBrowser, locateInstalledChrome } from '@studio/hyperframes';
import { HYPERFRAMES_CHROME_VERSION, HYPERFRAMES_FORMAT_VERSION, hyperframesPaths } from '@studio/shared/hyperframes';
import { ensureHyperframesFolders, writeChromeFile } from '@studio/shared/hyperframes/files';
import { TerminalRequiredError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { HYPERFRAMES_CLI_ACTOR, startingProcess, withScratchFolder } from '../hyperframes/cli-runtime.js';
import { renderRuntimeRefusalError, withHyperframesErrors } from '../hyperframes/hyperframes.errors.js';
import { type HyperframesCommandPorts } from '../hyperframes/hyperframes-ports.js';
import { chromeInstallNotice } from '../hyperframes/hyperframes-texts.js';
import { askTypedConfirmation } from '../hyperframes/typed-confirmation.js';
import { formatBytes } from '../output/format.js';
import { type CommandDependencies } from './command-dependencies.js';
import { recordHyperframesEvent } from './hyperframes.command.js';

const COMMAND_NAME = 'hyperframes chrome install';

/**
 * Owner step O2 (SPEC 0008 section 5.5, OD4 answer a). On a terminal only: it announces build,
 * size, host and destination, takes the typed version, seeds `config/config.json`, runs
 * `browser ensure` unsandboxed into `<data home>/hyperframes/cache/`, then records the one pinned
 * `chrome-headless-shell` in `chrome.json`. Zero or several matches, or another version, write no
 * `chrome.json`. The owner's `~/.cache/hyperframes` is never read, listed or copied (AC 84).
 */
export async function hyperframesChromeInstallCommand(ports: HyperframesCommandPorts, dependencies: CommandDependencies): Promise<number> {
  const { settings, printer, signal } = dependencies;
  if (!ports.terminal.isInteractive()) throw new TerminalRequiredError(COMMAND_NAME);
  return withHyperframesErrors(async () => {
    const dataHomeRoot = settings.dataHome.root;
    const paths = hyperframesPaths(dataHomeRoot);
    // The pin is asserted before the owner is asked anything, so a wrong install never downloads.
    const checked = checkInstallRuntime(dataHomeRoot);
    if (checked.status === 'refused') throw renderRuntimeRefusalError(checked.reason);
    for (const line of chromeInstallNotice(paths.cacheDir)) printer.line(line);
    await askTypedConfirmation(ports.terminal, signal, {
      label: cliText().hyperframes.chromeInstallPrompt(HYPERFRAMES_CHROME_VERSION),
      expected: HYPERFRAMES_CHROME_VERSION,
    });

    await ensureHyperframesFolders(dataHomeRoot);
    const installed = await withScratchFolder('studio-hyperframes-chrome-', async (tmpDir) => {
      await ensureBrowser(completeInstallRuntime(checked.runtime, startingProcess(settings, tmpDir)), { process: ports.process(signal) });
      return locateInstalledChrome(paths.cacheDir);
    });
    await writeChromeFile(dataHomeRoot, {
      format: HYPERFRAMES_FORMAT_VERSION,
      version: installed.version,
      executablePath: installed.executablePath,
      sha256: installed.sha256,
      sizeBytes: installed.sizeBytes,
      installedAt: ports.now().toISOString(),
      installedBy: HYPERFRAMES_CLI_ACTOR,
    });
    printer.line(cliText().hyperframes.chromeInstalled(installed.version, formatBytes(installed.sizeBytes)));
    printer.line(cliText().hyperframes.nextTrace);
    await recordHyperframesEvent(ports, printer, { event: 'hyperframes.chrome-installed', version: installed.version, sizeBytes: installed.sizeBytes });
    return ExitCode.ok;
  });
}
