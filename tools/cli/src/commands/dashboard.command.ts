import { render } from 'ink';
import { createElement } from 'react';
import { CliUsageError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { Dashboard } from '../ui/dashboard.js';
import { withAlternateScreen } from '../ui/full-screen.js';
import { requestRunControl } from './run-control.command.js';
import { type CommandDependencies } from './command-dependencies.js';

/**
 * `studio` with no arguments on a terminal: the Ink dashboard on the alternate screen. Each
 * pause/stop/resume boots its own short Nest context instead of holding one for the session, so a
 * database that is briefly locked or missing does not take the read-only view down with it.
 */
export async function dashboardCommand(dependencies: CommandDependencies): Promise<number> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) throw new CliUsageError(cliText().usage.dashboardNeedsTerminal);
  const { settings } = dependencies;
  await withAlternateScreen(process.stdout, async () => {
    // Ink reads stdin in raw mode, so Ctrl-C arrives as a key and Ink's default `exitOnCtrlC` ends
    // the app; the abort listener covers a SIGINT sent from outside the terminal.
    const instance = render(
      createElement(Dashboard, { runsRoot: settings.dataHome.runs, dataHomeRoot: settings.dataHome.root, requestControl: requestRunControl }),
    );
    const unmountOnAbort = (): void => instance.unmount();
    dependencies.signal.addEventListener('abort', unmountOnAbort, { once: true });
    try {
      await instance.waitUntilExit();
    } finally {
      dependencies.signal.removeEventListener('abort', unmountOnAbort);
    }
  });
  return dependencies.signal.aborted ? ExitCode.interrupted : ExitCode.ok;
}
