import { dirname } from 'node:path';
import { runtimeChildEnvironment } from '@studio/core/runtime';
import { portalOriginChildEnvironment } from '../portal/portal-settings';
import { type SetupFileSystem } from './setup-file-system';
import { type SetupLogger } from './setup-log';
import { type SetupPaths } from './setup-paths';
import { type SetupRecordStore } from './setup-record';
import { type ProcessRequest, type ProcessRunner } from './process-runner';
import { type Clock, type SetupInteraction } from './setup-types';

/**
 * Packaged children never see Homebrew or an inherited PATH tail (DI-AC-03): `/usr/bin:/bin` only,
 * and the locator puts the bundled `bin/` and `node/bin/` in front of them. The watcher plist uses
 * the same value.
 */
export const PACKAGED_BASE_PATH = '/usr/bin:/bin';

/** Non-secret variables passed through when the shell has them, as `actions/child-environment.ts` does. */
const PASSED_THROUGH = ['HOME', 'TMPDIR', 'LANG'] as const;

export interface StudioPorts {
  readonly web: number;
  readonly api: number;
}

/** Everything a step needs, injected: tests swap the runner, the file system, the clock and the user. */
export interface SetupContext {
  readonly paths: SetupPaths;
  /** Semver of the running app (`app.getVersion()`); upgrades are detected against it. */
  readonly appVersion: string;
  readonly ports: StudioPorts;
  readonly parentEnvironment: Readonly<Record<string, string | undefined>>;
  readonly run: ProcessRunner;
  readonly files: SetupFileSystem;
  /** One store per setup run, built over `files` and `paths.setupStateFile`. */
  readonly record: SetupRecordStore;
  readonly clock: Clock;
  /** Waits between polls (launchd unloading an agent); tests pass one that resolves at once. */
  readonly pause: (milliseconds: number) => Promise<void>;
  readonly log: SetupLogger;
  readonly interaction: SetupInteraction;
  readonly isProcessAlive: (pid: number) => boolean;
}

/**
 * The explicit environment of every packaged child: an allowlist, never the shell's environment
 * wholesale, plus the C3 runtime variable (absolute, normalized, from the locator) and PATH.
 */
export function packagedChildEnvironment(context: SetupContext, extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  const environment: Record<string, string> = { PATH: PACKAGED_BASE_PATH };
  for (const name of PASSED_THROUGH) {
    const value = context.parentEnvironment[name];
    if (value !== undefined && value !== '') environment[name] = value;
  }
  // Step 8 runs `studio start` through here; the CLI hands the origin to the api only.
  Object.assign(environment, portalOriginChildEnvironment(context.parentEnvironment));
  environment['ENGINEOS_VIDEO_CREATOR_HOME'] = context.paths.dataHome.root;
  environment['ENGINEOS_VIDEO_CREATOR_WEB_PORT'] = String(context.ports.web);
  environment['ENGINEOS_VIDEO_CREATOR_API_PORT'] = String(context.ports.api);
  return runtimeChildEnvironment(context.paths.runtime, { ...environment, ...extra });
}

export interface CliCallOptions {
  readonly stdin?: Buffer;
  readonly captureStdout?: boolean;
}

/** `<bundled node> <payload cli> <args>`; the arguments are fixed literals chosen by the step. */
export function cliRequest(context: SetupContext, args: readonly string[], options: CliCallOptions = {}): ProcessRequest {
  const { paths } = context;
  return {
    command: paths.runtime.nodeBinary,
    args: [paths.cliMain, ...args],
    cwd: dirname(paths.cliMain),
    env: packagedChildEnvironment(context),
    ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
    ...(options.captureStdout === true ? { captureStdout: true } : {}),
  };
}

/** Exit code of a CLI call, or null when it could not start or was ended by a signal. */
export async function runCli(context: SetupContext, args: readonly string[], options: CliCallOptions = {}): Promise<number | null> {
  const result = await context.run(cliRequest(context, args, options));
  return result.kind === 'exited' ? result.code : null;
}

/** Exit codes of `tools/cli/src/errors/exit-codes.ts` the steps branch on. */
export const CLI_EXIT = { ok: 0, notFound: 3, dependency: 5, unhealthy: 6, partial: 7 } as const;
