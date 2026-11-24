import { type ProcessRunner } from './process-runner';

/*
 * Who still uses the studio database, asked of the machine before a migration: a listener on the
 * packaged API port, and any process holding the SQLite file open. Read-only `lsof` calls with an
 * absolute executable, an argument array and no shell; nothing is signalled here. lsof without
 * root sees this user's processes only, which is every process that can open the owner-only data
 * home.
 */

const LSOF = '/usr/sbin/lsof';

/** lsof reads no variable of the shell; the system folders are all it could need. */
const TOOL_ENVIRONMENT: Readonly<Record<string, string>> = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };

const MIN_PORT = 1;
const MAX_PORT = 65_535;

/** `unknown`: lsof could not be started or ended abnormally, so the machine gave no answer. */
export type HolderProbe = 'free' | 'held' | 'unknown';

/**
 * With `-t` lsof prints one pid per line and nothing else. It exits 1 when it found nothing, and
 * also when a warning went to stderr beside real results, so a printed pid decides before the code.
 */
async function probe(run: ProcessRunner, args: readonly string[]): Promise<HolderProbe> {
  const result = await run({ command: LSOF, args, cwd: '/', env: TOOL_ENVIRONMENT, captureStdout: true });
  if (result.kind !== 'exited') return 'unknown';
  if (result.stdout.split(/\s+/).some((token) => /^\d+$/.test(token))) return 'held';
  return result.code === 0 || result.code === 1 ? 'free' : 'unknown';
}

/** Whether a process of this user listens on TCP `port`, on any address. */
export function probePortListener(run: ProcessRunner, port: number): Promise<HolderProbe> {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return Promise.resolve('unknown');
  return probe(run, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
}

/**
 * Whether a process of this user has `file` open. A file that does not exist yet (first install) is
 * `free`: lsof reports the missing name on stderr and exits 1.
 */
export function probeFileHolder(run: ProcessRunner, file: string): Promise<HolderProbe> {
  // An absolute path cannot be read as an option; anything else is not a path setup built.
  if (!file.startsWith('/') || file.includes('\0')) return Promise.resolve('unknown');
  return probe(run, ['-nP', '-t', file]);
}
