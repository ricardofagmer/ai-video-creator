import { connect } from 'node:net';
import { runReadOnly } from '../doctor/system-probes.js';
import { LOOPBACK_HOST } from './service-spec.js';

/** Absolute path: never resolved through PATH. */
const PS_PATH = '/bin/ps';
const LSOF_PATH = '/usr/sbin/lsof';
const PORT_PROBE_TIMEOUT_MS = 1000;

/**
 * Full command line of a pid, read-only (`ps -ww -o command= -p <pid>`, fixed argv; `-ww` keeps
 * it from being cut to a terminal width). Null when the process is gone.
 */
export async function readCommandLine(pid: number, environment: Readonly<Record<string, string>>): Promise<string | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const result = await runReadOnly(PS_PATH, ['-ww', '-o', 'command=', '-p', String(pid)], environment);
  if (result.status === 'failed') return null;
  const line = result.stdout.trim();
  return line === '' ? null : line;
}

function isArgumentBoundary(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character);
}

/**
 * The recorded process is the one `studio start` launched: its command line runs the entry file.
 * `ps` joins the arguments with spaces and the packaged entry path holds spaces itself
 * (`/Applications/EngineOS Video Creator.app/...`), so the path is matched as one whole argument,
 * bounded by the ends of the line or whitespace, never token by token.
 */
export function isLaunchedProcess(commandLine: string, entryPath: string): boolean {
  if (entryPath === '') return false;
  let index = commandLine.indexOf(entryPath);
  while (index >= 0) {
    const end = index + entryPath.length;
    if (isArgumentBoundary(index === 0 ? undefined : commandLine[index - 1]) && isArgumentBoundary(commandLine[end])) return true;
    index = commandLine.indexOf(entryPath, index + 1);
  }
  return false;
}

/** True when `pid` itself holds a listening TCP socket on `port` (`lsof`, fixed argv, read-only). */
async function isListeningOn(pid: number, port: number, environment: Readonly<Record<string, string>>): Promise<boolean> {
  const result = await runReadOnly(LSOF_PATH, ['-nP', '-a', '-p', String(pid), `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], environment);
  if (result.status === 'failed') return false;
  return result.stdout.split(/\s+/).includes(String(pid));
}

export interface LaunchedServiceCheck {
  pid: number;
  commandLine: string;
  entryPath: string;
  port: number;
  processTitlePrefix?: string;
  environment: Readonly<Record<string, string>>;
}

/**
 * Like `isLaunchedProcess`, but also accepts a service that renamed itself (Next shows
 * `next-server (v…)` instead of its command line). A renamed title alone could match any Next
 * server, so it counts only when this very pid listens on the recorded port.
 */
export async function isLaunchedService(check: LaunchedServiceCheck): Promise<boolean> {
  if (isLaunchedProcess(check.commandLine, check.entryPath)) return true;
  if (check.processTitlePrefix === undefined || !check.commandLine.startsWith(check.processTitlePrefix)) return false;
  return isListeningOn(check.pid, check.port, check.environment);
}

/** True when something accepts TCP connections on `127.0.0.1:<port>`; any doubt counts as taken. */
export function isPortTaken(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: LOOPBACK_HOST, port });
    const finish = (taken: boolean): void => {
      socket.destroy();
      resolve(taken);
    };
    socket.setTimeout(PORT_PROBE_TIMEOUT_MS, () => finish(true));
    socket.once('connect', () => finish(true));
    socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code !== 'ECONNREFUSED'));
  });
}
