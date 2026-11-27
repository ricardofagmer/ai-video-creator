import { type SetupContext } from '../setup-context';
import { bootoutAgent, bootstrapAgent, isAgentLoaded, isValidPlist, type LaunchdPorts, type LaunchdTarget } from '../launchd-agent';
import { renderWatcherPlist } from '../plist-render';
import { type SetupStep, type StepRunResult } from '../setup-types';

/** The rendered plist is about 2 KB. */
const MAX_PLIST_BYTES = 64 * 1024;
/** Readable by launchd and the user, writable by the user only, as install.sh writes it. */
const PLIST_FILE_MODE = 0o644;
/** `mkdir -p` default; ~/Library/LaunchAgents is a standard, non-private folder. */
const LAUNCH_AGENTS_FOLDER_MODE = 0o755;

function launchdPorts(context: SetupContext): LaunchdPorts {
  return { run: context.run, pause: context.pause };
}

function launchdTarget(context: SetupContext): LaunchdTarget {
  return { domain: context.paths.launchdDomain, service: context.paths.launchdService };
}

/** True when the installed file is exactly this render, 644, a regular file (a symlink is not). */
async function isPlistCurrent(context: SetupContext, text: string): Promise<boolean> {
  const entry = await context.files.inspect(context.paths.plistFile);
  if (entry.kind !== 'file' || entry.mode !== PLIST_FILE_MODE) return false;
  const installed = await context.files.readText(context.paths.plistFile, MAX_PLIST_BYTES);
  return installed.status === 'read' && installed.text === text;
}

async function ensureLaunchAgentsFolder(context: SetupContext): Promise<boolean> {
  const folder = await context.files.inspect(context.paths.launchAgentsFolder);
  if (folder.kind === 'folder') return true;
  if (folder.kind !== 'absent') return false;
  await context.files.makeFolder(context.paths.launchAgentsFolder, LAUNCH_AGENTS_FOLDER_MODE);
  return true;
}

/**
 * Step 6: the watcher agent from the packaged template, with paths inside this app copy. The render
 * names the app version, so a new version or a moved app re-renders the file and restarts the
 * agent; the data home, the passphrase hash and the Keychain keys are not touched (DI-AC-05). An
 * unchanged file with a loaded agent is already done, and the agent is not restarted (DI-AC-02).
 */
export function watcherAgentStep(context: SetupContext): SetupStep {
  const ports = launchdPorts(context);
  const target = launchdTarget(context);
  return {
    id: 'watcher-agent',
    required: true,
    async check() {
      const render = renderWatcherPlist(context);
      if (render.kind !== 'rendered') return { kind: 'needed' };
      const current = (await isPlistCurrent(context, render.text)) && (await isAgentLoaded(ports, target));
      return current ? { kind: 'done' } : { kind: 'needed' };
    },
    async run(): Promise<StepRunResult> {
      const render = renderWatcherPlist(context);
      if (render.kind !== 'rendered') return { kind: 'failed', reason: 'plist-invalid' };
      const unchanged = await isPlistCurrent(context, render.text);
      if (unchanged && (await isAgentLoaded(ports, target))) return { kind: 'done' };
      if (!unchanged) {
        if (!(await ensureLaunchAgentsFolder(context))) return { kind: 'failed', reason: 'plist-invalid' };
        await context.files.writeTextAtomic(context.paths.plistFile, render.text, PLIST_FILE_MODE);
        if (!(await isValidPlist(ports, context.paths.plistFile))) {
          await context.files.removeFile(context.paths.plistFile);
          return { kind: 'failed', reason: 'plist-invalid' };
        }
      }
      // A changed file only takes effect after a bootout; a running run resumes from its step.
      if (!(await bootoutAgent(ports, target))) return { kind: 'failed', reason: 'agent-not-loaded' };
      return (await bootstrapAgent(ports, target, context.paths.plistFile)) ? { kind: 'done' } : { kind: 'failed', reason: 'agent-not-loaded' };
    },
  };
}
