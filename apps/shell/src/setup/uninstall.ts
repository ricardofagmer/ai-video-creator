import { runCli, type SetupContext } from './setup-context';
import { bootoutAgent } from './launchd-agent';
import { type UninstallPart } from './setup-log';

/*
 * Uninstall from the app (plan section 5, DI-AC-06): stop the services, remove the watcher agent,
 * the login item and the app itself. The data home (database, assets, runs, logs, passphrase hash)
 * is kept unless the user confirmed its deletion in a separate, explicit question; Keychain keys are
 * never touched here. Every part is attempted even when an earlier one failed, and each failure is
 * reported by part, so the user is told exactly what is left.
 */

/** The decision the uninstall dialog collected; `delete-data` only after its own confirmation. */
export type DataHomeDecision = 'keep-data' | 'delete-data';

export interface UninstallPorts {
  /** Electron's login item setter; throws when macOS refuses. */
  readonly disableLoginItem: () => void;
  /** Moves a folder to the Trash (`shell.trashItem`), so a mistaken uninstall can be undone. */
  readonly moveToTrash: (path: string) => Promise<void>;
}

export interface UninstallReport {
  readonly failedParts: readonly UninstallPart[];
  readonly dataHome: 'kept' | 'moved-to-trash' | 'failed';
}

type PartAttempt = (part: UninstallPart, work: () => Promise<unknown>) => Promise<boolean>;

/** Runs one part; a throw or a `false` result records the part as failed. */
function partAttempter(context: SetupContext, failed: UninstallPart[]): PartAttempt {
  return async (part, work) => {
    let succeeded: boolean;
    try {
      succeeded = (await work()) !== false;
    } catch {
      succeeded = false;
    }
    if (!succeeded) {
      failed.push(part);
      context.log({ event: 'uninstall-step-failed', part });
    }
    return succeeded;
  };
}

async function removeWatcherAgent(context: SetupContext): Promise<boolean> {
  const unloaded = await bootoutAgent({ run: context.run, pause: context.pause }, { domain: context.paths.launchdDomain, service: context.paths.launchdService });
  await context.files.removeFile(context.paths.plistFile);
  return unloaded;
}

/**
 * Runs every part in order and returns what failed. The caller quits the app afterwards: the bundle
 * is moved to the Trash while it runs, which macOS allows, and nothing is read from it after that.
 */
export async function runUninstall(context: SetupContext, ports: UninstallPorts, decision: DataHomeDecision): Promise<UninstallReport> {
  context.log({ event: 'uninstall-started' });
  const failed: UninstallPart[] = [];
  const attempt = partAttempter(context, failed);
  // `studio stop` exits non-zero when nothing runs; only a CLI that could not start counts as failed.
  await attempt('services', async () => (await runCli(context, ['stop'])) !== null);
  await attempt('watcher-agent', () => removeWatcherAgent(context));
  await attempt('login-item', async () => ports.disableLoginItem());
  let dataHome: UninstallReport['dataHome'] = 'kept';
  if (decision === 'delete-data') {
    const trashed = await attempt('data-home', () => ports.moveToTrash(context.paths.dataHome.root));
    dataHome = trashed ? 'moved-to-trash' : 'failed';
  }
  await attempt('app', () => ports.moveToTrash(context.paths.appBundle));
  context.log({ event: 'uninstall-finished' });
  return { failedParts: failed, dataHome };
}
