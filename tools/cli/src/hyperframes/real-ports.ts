import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { createSpawnProcessPort, sandboxExecExists } from '@studio/hyperframes';
import { withCliContext } from '../nest/cli-context.js';
import { processTerminal } from '../terminal/line-prompt.js';
import {
  type HyperframesCommandPorts,
  type HyperframesEventPort,
  type HyperframesSystemPort,
  type PictureProbeRead,
  type SandboxLogRead,
} from './hyperframes-ports.js';
import { parsePictureProbe, pictureProbeArgs } from './picture-probe.js';
import { SANDBOX_DENIAL_PREDICATE, parseSandboxDenials } from './sandbox-log.js';

/*
 * The real adapters of `studio hyperframes`. Every external program runs by a fixed argv with no
 * shell and an explicit minimal environment (never `process.env`). Their output stays in memory
 * for parsing and is never printed or logged. Tests use fakes and never import this module (K11).
 */

/** Absolute path: never resolved through PATH, so a planted `log` is not run. */
const LOG_PATH = '/usr/bin/log';
const LOG_TIMEOUT_MS = 60_000;
const LOG_MAX_BYTES = 8 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_MAX_BYTES = 256 * 1024;
const SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

type ExecResult = { status: 'ok'; stdout: string } | { status: 'failed' };

function runBounded(
  command: string,
  args: readonly string[],
  options: { environment: Readonly<Record<string, string>>; timeoutMs: number; maxBytes: number },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { encoding: 'utf8', timeout: options.timeoutMs, maxBuffer: options.maxBytes, shell: false, windowsHide: true, env: { ...options.environment } },
      (error, stdout) => resolve(error === null ? { status: 'ok', stdout } : { status: 'failed' }),
    );
  });
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** `log show` reads `--start` and `--end` as local wall-clock time. */
function localTimestamp(instant: Date): string {
  const date = `${instant.getFullYear()}-${twoDigits(instant.getMonth() + 1)}-${twoDigits(instant.getDate())}`;
  return `${date} ${twoDigits(instant.getHours())}:${twoDigits(instant.getMinutes())}:${twoDigits(instant.getSeconds())}`;
}

const macSystemPort: HyperframesSystemPort = {
  sandboxExecExists,
  async readSandboxDenials(window): Promise<SandboxLogRead> {
    const args = ['show', '--style', 'ndjson', '--start', localTimestamp(window.start), '--end', localTimestamp(window.end), '--predicate', SANDBOX_DENIAL_PREDICATE];
    const result = await runBounded(LOG_PATH, args, { environment: { PATH: SYSTEM_PATH, LANG: 'C' }, timeoutMs: LOG_TIMEOUT_MS, maxBytes: LOG_MAX_BYTES });
    return result.status === 'ok' ? { status: 'read', denials: parseSandboxDenials(result.stdout) } : { status: 'unavailable' };
  },
  async probePicture(file, searchPath): Promise<PictureProbeRead> {
    const result = await runBounded('ffprobe', pictureProbeArgs(file), { environment: { PATH: searchPath }, timeoutMs: PROBE_TIMEOUT_MS, maxBytes: PROBE_MAX_BYTES });
    if (result.status !== 'ok') return { status: 'unavailable' };
    const probe = parsePictureProbe(result.stdout);
    return probe === null ? { status: 'unavailable' } : { status: 'read', probe };
  },
  pause: (milliseconds, signal) => delay(milliseconds, undefined, { signal }),
};

/**
 * Section 7 events go to `cli.log` through the CLI's redacting logger, which needs the booted
 * context. The command reports a failed record as a warning; the step it records stays done.
 */
const cliLogEvents: HyperframesEventPort = {
  record: (event) =>
    withCliContext(async () => {
      new Logger('HyperframesCli').log(event);
    }),
};

export const hyperframesPorts: HyperframesCommandPorts = {
  now: () => new Date(),
  terminal: processTerminal,
  process: (signal) => createSpawnProcessPort({ signal }),
  system: macSystemPort,
  events: cliLogEvents,
};
