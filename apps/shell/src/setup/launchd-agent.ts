import { type ProcessRunner } from './process-runner';

/*
 * The watcher agent through launchctl, as `scripts/lib/common.sh` drives it: `print` to ask whether
 * it is loaded, `bootout` and a bounded wait to unload it, `bootstrap` to load a plist. Absolute
 * executables, argument arrays, no shell; the label and paths come from setup, never from the user.
 */

const LAUNCHCTL = '/bin/launchctl';
const PLUTIL = '/usr/bin/plutil';
/** ExitTimeOut is 30 s; common.sh gives launchd 40 s to let the agent go. */
const BOOTOUT_WAIT_POLLS = 40;
const BOOTOUT_POLL_MILLISECONDS = 1000;

export interface LaunchdPorts {
  readonly run: ProcessRunner;
  readonly pause: (milliseconds: number) => Promise<void>;
}

export interface LaunchdTarget {
  /** `gui/<uid>`. */
  readonly domain: string;
  /** `gui/<uid>/com.videostudio.watcher`. */
  readonly service: string;
}

/** launchctl and plutil read no variable of the shell; the system folders are all they could need. */
const TOOL_ENVIRONMENT: Readonly<Record<string, string>> = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };

async function exitCodeOf(ports: LaunchdPorts, command: string, args: readonly string[]): Promise<number | null> {
  const result = await ports.run({ command, args, cwd: '/', env: TOOL_ENVIRONMENT });
  return result.kind === 'exited' ? result.code : null;
}

export async function isAgentLoaded(ports: LaunchdPorts, target: LaunchdTarget): Promise<boolean> {
  return (await exitCodeOf(ports, LAUNCHCTL, ['print', target.service])) === 0;
}

/** True once the agent is no longer loaded (or never was); false when launchd kept it past the wait. */
export async function bootoutAgent(ports: LaunchdPorts, target: LaunchdTarget): Promise<boolean> {
  if (!(await isAgentLoaded(ports, target))) return true;
  // A not-loaded race between the check and the call is not an error; the wait below decides.
  await exitCodeOf(ports, LAUNCHCTL, ['bootout', target.service]);
  for (let poll = 0; poll < BOOTOUT_WAIT_POLLS; poll += 1) {
    if (!(await isAgentLoaded(ports, target))) return true;
    await ports.pause(BOOTOUT_POLL_MILLISECONDS);
  }
  return !(await isAgentLoaded(ports, target));
}

export async function bootstrapAgent(ports: LaunchdPorts, target: LaunchdTarget, plistFile: string): Promise<boolean> {
  if ((await exitCodeOf(ports, LAUNCHCTL, ['bootstrap', target.domain, plistFile])) !== 0) return false;
  return isAgentLoaded(ports, target);
}

/** `plutil -lint -s`: exit 0 for a well-formed property list. */
export async function isValidPlist(ports: LaunchdPorts, file: string): Promise<boolean> {
  return (await exitCodeOf(ports, PLUTIL, ['-lint', '-s', file])) === 0;
}
