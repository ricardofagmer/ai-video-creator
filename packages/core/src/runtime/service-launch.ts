import { dirname, join } from 'node:path';
import { locateNodeBinary } from './runtime-programs';
import { type PackagedRuntime, type StudioRuntime } from './studio-runtime';

/** The two long-running services the CLI and the shell start. */
export type StudioServiceName = 'api' | 'web';

export interface ServiceLaunchRequest {
  service: StudioServiceName;
  /** Development only: the monorepo root that holds `apps/api` and `apps/web`. */
  studioRoot: string;
  /** Development only: the caller's running node (`process.execPath`). */
  runningNode: string;
  /** Development `next start --hostname`; the packaged web always binds `127.0.0.1` (DI-AC-23). */
  hostname: string;
  port: number;
}

/** How one service process is started: fixed argv, no shell. */
export interface ServiceLaunch {
  executable: string;
  /** First argument; what `stop` looks for in the process command line before signalling. */
  entryPath: string;
  args: readonly string[];
  cwd: string;
  /** Variables this launch needs on top of the caller's own explicit environment. */
  environment: Readonly<Record<string, string>>;
}

/**
 * Next standalone output keeps the monorepo layout relative to `outputFileTracingRoot` (the
 * repository root, pinned in `apps/web/next.config.ts`), so the server sits at `apps/web/server.js`
 * inside the staged `.next/standalone/` copy, beside the `node_modules/` it requires.
 */
const WEB_STANDALONE_SERVER_SEGMENTS: readonly string[] = ['apps', 'web', 'server.js'];

/**
 * DI-AC-23: the packaged web binds the loopback address only. Fixed here rather than taken from the
 * request, because Next standalone listens on every interface when HOSTNAME is missing or wider.
 */
const PACKAGED_WEB_HOSTNAME = '127.0.0.1';

/** Same file the api `start` script runs (`node dist/main.js`), in the checkout or the payload. */
const API_ENTRY_SEGMENTS: readonly string[] = ['dist', 'main.js'];

function developmentLaunch(request: ServiceLaunchRequest): ServiceLaunch {
  if (request.service === 'api') {
    const cwd = join(request.studioRoot, 'apps', 'api');
    const entryPath = join(cwd, ...API_ENTRY_SEGMENTS);
    return { executable: request.runningNode, entryPath, args: [entryPath], cwd, environment: {} };
  }
  const cwd = join(request.studioRoot, 'apps', 'web');
  const entryPath = join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
  return {
    executable: request.runningNode,
    entryPath,
    args: [entryPath, 'start', '--hostname', request.hostname, '--port', String(request.port)],
    cwd,
    environment: {},
  };
}

function packagedLaunch(runtime: PackagedRuntime, request: ServiceLaunchRequest): ServiceLaunch {
  const executable = locateNodeBinary(runtime, request.runningNode);
  if (request.service === 'api') {
    const cwd = runtime.payload.api;
    const entryPath = join(cwd, ...API_ENTRY_SEGMENTS);
    return { executable, entryPath, args: [entryPath], cwd, environment: {} };
  }
  const entryPath = join(runtime.payload.web, ...WEB_STANDALONE_SERVER_SEGMENTS);
  // The standalone server takes no flags: it reads its bind address from PORT and HOSTNAME.
  return {
    executable,
    entryPath,
    args: [entryPath],
    cwd: dirname(entryPath),
    environment: { PORT: String(request.port), HOSTNAME: PACKAGED_WEB_HOSTNAME },
  };
}

/**
 * Executable, entry file, argv and working folder of a service. Development mode returns exactly
 * the launch `studio start` used before the locator (`node apps/api/dist/main.js`, `next start`);
 * packaged mode runs the payload with the bundled node, the web from Next standalone output.
 */
export function locateServiceLaunch(runtime: StudioRuntime, request: ServiceLaunchRequest): ServiceLaunch {
  return runtime.mode === 'development' ? developmentLaunch(request) : packagedLaunch(runtime, request);
}
