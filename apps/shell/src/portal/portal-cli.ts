import { dirname } from 'node:path';
import { runtimeChildEnvironment, type PackagedRuntime } from '@studio/core/runtime';
import { buildChildEnvironment } from '../actions/child-environment';
import { type ShellConfig } from '../config/shell-config';
import { type ProcessRequest } from '../setup/process-runner';
import { PACKAGED_BASE_PATH } from '../setup/setup-context';

/** The two fixed CLI calls; no argument ever comes from menu text, a file or the network. */
export const PORTAL_PAIR_ARGS: readonly string[] = ['portal', 'pair'];
export const PORTAL_DISCONNECT_ARGS: readonly string[] = ['portal', 'disconnect'];

export type PortalCliRequest = (args: readonly string[]) => ProcessRequest;

export interface PortalCliOptions {
  readonly config: Pick<ShellConfig, 'nodeBinary' | 'cliMain' | 'dataHome' | 'webPort' | 'apiPort'>;
  readonly parentEnvironment: Readonly<Record<string, string | undefined>>;
  /**
   * Packaged mode adds the runtime variable and the minimal PATH, as `packagedSpawner` does for
   * start and stop; development passes the allowlisted environment unchanged.
   */
  readonly adaptEnvironment?: (environment: Record<string, string>) => Record<string, string>;
}

/** Packaged children: the C3 runtime variable and `/usr/bin:/bin` behind the bundled folders (DI-AC-03). */
export function packagedCliEnvironment(runtime: PackagedRuntime): (environment: Record<string, string>) => Record<string, string> {
  return (environment) => runtimeChildEnvironment(runtime, { ...environment, PATH: PACKAGED_BASE_PATH });
}

/**
 * `<node> <cli main> portal pair|disconnect`, with the same allowlisted environment the start/stop
 * children get. stdout is captured (bounded) for the one JSON line; stderr is discarded by the runner.
 */
export function portalCliRequest(options: PortalCliOptions): PortalCliRequest {
  const { config, parentEnvironment, adaptEnvironment } = options;
  return (args) => {
    const base = buildChildEnvironment(config, parentEnvironment);
    return {
      command: config.nodeBinary,
      args: [config.cliMain, ...args],
      cwd: dirname(config.cliMain),
      env: adaptEnvironment === undefined ? base : adaptEnvironment(base),
      captureStdout: true,
    };
  };
}
