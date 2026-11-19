import { connect } from 'node:net';
import { runReadOnly } from '../doctor/system-probes.js';
import { LOOPBACK_HOST } from './service-spec.js';

/** Absolute path: never resolved through PATH. */
const PS_PATH = '/bin/ps';
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

/** The recorded process is the one `studio start` launched: its command line runs the entry file. */
export function isLaunchedProcess(commandLine: string, entryPath: string): boolean {
  return commandLine.split(/\s+/).includes(entryPath);
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
