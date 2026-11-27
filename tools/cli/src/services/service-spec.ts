import { join } from 'node:path';
import { locateServiceLaunch, type StudioRuntime } from '@studio/core/runtime';
import { type ServiceName } from '../errors/service.errors.js';
import { WEB_PORT_ENV_VAR, type CliSettings } from '../settings/cli-settings.js';

/** Both services bind here only (PRD 12, criterion 23). */
export const LOOPBACK_HOST = '127.0.0.1';

/** Everything needed to launch, recognise and stop one service process. */
export interface ServiceSpec {
  name: ServiceName;
  /**
   * Absolute node binary, never resolved through PATH: this CLI's own (`process.execPath`) in
   * development, the bundled `node/bin/node` in packaged mode (plan C3 rev 2).
   */
  executable: string;
  /** First argument; also what `stop` looks for in the process command line before signalling. */
  entryPath: string;
  args: string[];
  cwd: string;
  /** Explicit minimal environment (SPEC 0002 rev 3); no provider key, never `process.env`. */
  env: Record<string, string>;
  port: number;
  /**
   * Title the process gives itself after start, replacing its command line (Next sets
   * `next-server (v<version>)`). Only trusted together with the pid listening on `port`.
   */
  processTitlePrefix?: string;
  /** Probed on `127.0.0.1:<port>` to decide the service is ready. */
  healthPath: string;
  /** JSON pid record under `<data home>/logs/` (see `pidFilePath`). */
  pidFile: string;
  /** The child's stdout/stderr; the api also writes its own redacted `api.log`. */
  processLog: string;
}

/**
 * Pid records live in `<data home>/logs/`: D5 fixes the data home to `db/`, `assets/`, `runs/`,
 * `logs/`, and a new `run/` folder would sit one letter from `runs/` (run folders). `logs/` is
 * owner-only runtime state already, beside the process logs these records point to.
 */
export function pidFilePath(logsDirectory: string, name: ServiceName): string {
  return join(logsDirectory, `${name}.pid.json`);
}

/**
 * api (R1-16): `apps/api/dist/main.js`, the file its `start` script (`node dist/main.js`) runs;
 * port through `ENGINEOS_VIDEO_CREATOR_API_PORT`, and the web origin it must accept through
 * `ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN`, and the hosted portal origin (install-route CORS) through
 * `ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN` when the caller set it. The loopback bind itself is the
 * api's own `listen` (R1-16).
 * Packaged mode runs `payload/api/dist/main.js` with the bundled node (`locateServiceLaunch`).
 */
function apiSpec(settings: CliSettings, executable: string, runtime: StudioRuntime): ServiceSpec {
  const launch = locateServiceLaunch(runtime, {
    service: 'api',
    studioRoot: settings.studioRoot,
    runningNode: executable,
    hostname: LOOPBACK_HOST,
    port: settings.ports.api,
  });
  const logs = settings.dataHome.logs;
  return {
    name: 'api',
    executable: launch.executable,
    entryPath: launch.entryPath,
    args: [...launch.args],
    cwd: launch.cwd,
    env: {
      // Already carries the packaged PATH and runtime folder (`readCliSettings`).
      ...settings.childEnvironment,
      // The portal origin, when set; the web and every other child never receive it.
      ...settings.apiEnvironment,
      ...launch.environment,
      NODE_ENV: 'production',
      ENGINEOS_VIDEO_CREATOR_API_PORT: String(settings.ports.api),
      ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN: `http://${LOOPBACK_HOST}:${settings.ports.web}`,
    },
    port: settings.ports.api,
    healthPath: '/health',
    pidFile: pidFilePath(logs, 'api'),
    processLog: join(logs, 'api.process.log'),
  };
}

/**
 * web (R1-19, not built yet): `next start --hostname 127.0.0.1 --port <port>` run through the
 * Next binary of `apps/web`. Assumption reported in R1-21: the web reads the api origin from
 * `ENGINEOS_VIDEO_CREATOR_API_ORIGIN`. Next telemetry is off: the studio sends nothing (PRD 12).
 * Packaged mode runs the Next standalone `server.js` with the bundled node, bound through PORT and
 * HOSTNAME; it renames itself `next-server (v...)` just like `next start`.
 */
function webSpec(settings: CliSettings, executable: string, runtime: StudioRuntime): ServiceSpec {
  const launch = locateServiceLaunch(runtime, {
    service: 'web',
    studioRoot: settings.studioRoot,
    runningNode: executable,
    hostname: LOOPBACK_HOST,
    port: settings.ports.web,
  });
  const logs = settings.dataHome.logs;
  return {
    name: 'web',
    executable: launch.executable,
    entryPath: launch.entryPath,
    args: [...launch.args],
    cwd: launch.cwd,
    env: {
      // Already carries the packaged PATH and runtime folder (`readCliSettings`).
      ...settings.childEnvironment,
      ...launch.environment,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      // The web derives its allowed Host headers from this port; without it a non-default port
      // answers every request with 403 (apps/web `webConfig().allowedHosts`).
      [WEB_PORT_ENV_VAR]: String(settings.ports.web),
      ENGINEOS_VIDEO_CREATOR_API_ORIGIN: `http://${LOOPBACK_HOST}:${settings.ports.api}`,
    },
    port: settings.ports.web,
    processTitlePrefix: 'next-server (v',
    healthPath: '/',
    pidFile: pidFilePath(logs, 'web'),
    processLog: join(logs, 'web.process.log'),
  };
}

/** `executable` is the caller's running node, used as is in development mode only. */
export function serviceSpec(name: ServiceName, settings: CliSettings, executable: string): ServiceSpec {
  return name === 'api' ? apiSpec(settings, executable, settings.runtime) : webSpec(settings, executable, settings.runtime);
}
