import { join } from 'node:path';
import { type ServiceName } from '../errors/service.errors.js';
import { type CliSettings } from '../settings/cli-settings.js';

/** Both services bind here only (PRD 12, criterion 23). */
export const LOOPBACK_HOST = '127.0.0.1';

/** Everything needed to launch, recognise and stop one service process. */
export interface ServiceSpec {
  name: ServiceName;
  /** Absolute node binary of this CLI process (`process.execPath`): never resolved through PATH. */
  executable: string;
  /** First argument; also what `stop` looks for in the process command line before signalling. */
  entryPath: string;
  args: string[];
  cwd: string;
  /** Explicit minimal environment (SPEC 0002 rev 3); no provider key, never `process.env`. */
  env: Record<string, string>;
  port: number;
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
 * `ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN`. The loopback bind itself is the api's own `listen` (R1-16).
 */
function apiSpec(settings: CliSettings, executable: string): ServiceSpec {
  const cwd = join(settings.studioRoot, 'apps', 'api');
  const entryPath = join(cwd, 'dist', 'main.js');
  const logs = settings.dataHome.logs;
  return {
    name: 'api',
    executable,
    entryPath,
    args: [entryPath],
    cwd,
    env: {
      ...settings.childEnvironment,
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
 */
function webSpec(settings: CliSettings, executable: string): ServiceSpec {
  const cwd = join(settings.studioRoot, 'apps', 'web');
  const entryPath = join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
  const logs = settings.dataHome.logs;
  return {
    name: 'web',
    executable,
    entryPath,
    args: [entryPath, 'start', '--hostname', LOOPBACK_HOST, '--port', String(settings.ports.web)],
    cwd,
    env: {
      ...settings.childEnvironment,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      ENGINEOS_VIDEO_CREATOR_API_ORIGIN: `http://${LOOPBACK_HOST}:${settings.ports.api}`,
    },
    port: settings.ports.web,
    healthPath: '/',
    pidFile: pidFilePath(logs, 'web'),
    processLog: join(logs, 'web.process.log'),
  };
}

export function serviceSpec(name: ServiceName, settings: CliSettings, executable: string): ServiceSpec {
  return name === 'api' ? apiSpec(settings, executable) : webSpec(settings, executable);
}
