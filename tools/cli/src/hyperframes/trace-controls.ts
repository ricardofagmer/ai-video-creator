import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { SANDBOX_EXEC_PATH, type HyperframesProcessPort, type HyperframesRuntime } from '@studio/hyperframes';
import { type SandboxDenial } from './hyperframes-ports.js';
import { deniedTargetIs, isFileDenial, isFileReadDenial, isNetworkDenial, isProcessExecDenial } from './sandbox-log.js';

/*
 * The five trace controls (SPEC 0008 section 17.9, AC 93). Each is one `node -e` started with the
 * render's own `-f` and `-D` arguments from `buildSandboxArgs`, and exits 0 only when the
 * operating system refused the operation (`EPERM` or `EACCES`). Targets reach the script as
 * arguments, never as script text. No control touches `~/.ssh`, a Keychain, an `.env` file, a
 * daemon socket or a mach service (U12, U13).
 */

export type TraceControlId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
export type ProbedControlId = Exclude<TraceControlId, 'C1'>;

const CONTROL_ORDER: readonly TraceControlId[] = ['C1', 'C2', 'C3', 'C4', 'C5'];
export const PROBED_CONTROLS: readonly ProbedControlId[] = ['C2', 'C3', 'C4', 'C5'];

/** TEST-NET-1, never routed: a connection that leaves the Mac goes nowhere either way. */
const NETWORK_CONTROL_HOST = '192.0.2.1';
const NETWORK_CONTROL_PORT = '9';
export const NETWORK_CONTROL_TARGET = `${NETWORK_CONTROL_HOST}:${NETWORK_CONTROL_PORT}`;
const LOOPBACK_HOST = '127.0.0.1';
/** C2 starts this program; the profile allows only node, the pinned Chrome, ffmpeg and ffprobe. */
const EXEC_CONTROL_PROGRAM = '/usr/bin/true';
const PROBE_FILE_PREFIX = '.studio-trace-c3-';

/* Exit codes of a control: 0 refused by the sandbox, 10 the operation worked, 11 timeout, 12 other error. */
const REFUSED = "const refused = (error) => Boolean(error) && (error.code === 'EPERM' || error.code === 'EACCES');";

const CONNECT_SCRIPT = [
  REFUSED,
  "const socket = require('node:net').connect({ host: process.argv[1], port: Number(process.argv[2]) });",
  'socket.setTimeout(5000);',
  "socket.on('connect', () => { socket.destroy(); process.exit(10); });",
  "socket.on('timeout', () => { socket.destroy(); process.exit(11); });",
  "socket.on('error', (error) => process.exit(refused(error) ? 0 : 12));",
].join(' ');

const EXEC_SCRIPT = [
  REFUSED,
  "const result = require('node:child_process').spawnSync(process.argv[1], [], { stdio: 'ignore', shell: false });",
  'process.exit(result.error ? (refused(result.error) ? 0 : 12) : 10);',
].join(' ');

const CREATE_SCRIPT = [
  REFUSED,
  "const fs = require('node:fs');",
  "try { fs.closeSync(fs.openSync(process.argv[1], 'wx', 0o600)); process.exit(10); } catch (error) { process.exit(refused(error) ? 0 : 12); }",
].join(' ');

const LIST_SCRIPT = [
  REFUSED,
  "try { require('node:fs').readdirSync(process.argv[1]); process.exit(10); } catch (error) { process.exit(refused(error) ? 0 : 12); }",
].join(' ');

/** What the controls aim at, kept to tell their own denials apart in the system log. */
export interface TraceControlTargets {
  /** C3: a random name directly under `HF_ROOT`. */
  probeFile: string;
  /** C4: `DATA_HOME`. */
  dataHomeRoot: string;
  /** C5: the studio api's loopback port. */
  apiPort: number;
}

export interface TraceControlOutcome {
  targets: TraceControlTargets;
  exitCodes: Readonly<Record<TraceControlId, number>>;
  /** C3 left its file behind; the trace removed it. */
  probeFileRemoved: boolean;
}

export interface TraceControlRequest {
  /** Exactly `buildSandboxArgs` of the render: same template folder, same runtime. */
  sandboxArgs: readonly string[];
  runtime: HyperframesRuntime;
  cwd: string;
  env: Readonly<Record<string, string>>;
}

export function controlTargets(runtime: HyperframesRuntime): TraceControlTargets {
  return {
    probeFile: join(runtime.hyperframesRoot, `${PROBE_FILE_PREFIX}${randomUUID()}`),
    dataHomeRoot: runtime.dataHomeRoot,
    apiPort: runtime.apiPort,
  };
}

function scriptArgs(id: TraceControlId, targets: TraceControlTargets): readonly string[] {
  switch (id) {
    case 'C1':
      return [CONNECT_SCRIPT, NETWORK_CONTROL_HOST, NETWORK_CONTROL_PORT];
    case 'C2':
      return [EXEC_SCRIPT, EXEC_CONTROL_PROGRAM];
    case 'C3':
      return [CREATE_SCRIPT, targets.probeFile];
    case 'C4':
      return [LIST_SCRIPT, targets.dataHomeRoot];
    case 'C5':
      return [CONNECT_SCRIPT, LOOPBACK_HOST, String(targets.apiPort)];
  }
}

function errorCodeOf(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

/** Removes the C3 file if it exists; true when there was one. Runs unsandboxed, as the CLI. */
async function removeProbeFile(probeFile: string): Promise<boolean> {
  try {
    await unlink(probeFile);
    return true;
  } catch (error) {
    if (errorCodeOf(error) === 'ENOENT') return false;
    throw error;
  }
}

/** Runs C1 to C5 in order, each under the render's sandbox arguments, then removes a file left by C3. */
export async function runTraceControls(request: TraceControlRequest, processPort: HyperframesProcessPort): Promise<TraceControlOutcome> {
  const targets = controlTargets(request.runtime);
  const exitCodes: Record<TraceControlId, number> = { C1: -1, C2: -1, C3: -1, C4: -1, C5: -1 };
  let probeFileRemoved = false;
  try {
    for (const id of CONTROL_ORDER) {
      const args = [...request.sandboxArgs, request.runtime.nodePath, '-e', ...scriptArgs(id, targets)];
      const { exitCode } = await processPort.run({ command: SANDBOX_EXEC_PATH, args, cwd: request.cwd, env: request.env });
      exitCodes[id] = exitCode;
    }
  } finally {
    probeFileRemoved = await removeProbeFile(targets.probeFile);
  }
  return { targets, exitCodes, probeFileRemoved };
}

/** The C1 denial, which proves the log query sees the sandbox (rev 1 meaning of `controlDenied`). */
export function isNetworkControlDenial(denial: SandboxDenial): boolean {
  return isNetworkDenial(denial) && denial.target.includes(NETWORK_CONTROL_TARGET);
}

function isLoopbackPortTarget(target: string, port: number): boolean {
  return new RegExp(`(?:^|[^0-9.])(?:127\\.0\\.0\\.1|localhost):${port}(?![0-9])`).test(target);
}

/** A denial caused by C2 to C5 (their refusal itself is read from the exit code). */
export function isProbedControlDenial(denial: SandboxDenial, targets: TraceControlTargets): boolean {
  if (isNetworkDenial(denial)) return isLoopbackPortTarget(denial.target, targets.apiPort);
  if (isProcessExecDenial(denial)) return deniedTargetIs(denial, EXEC_CONTROL_PROGRAM);
  if (isFileReadDenial(denial) && (deniedTargetIs(denial, targets.dataHomeRoot) || deniedTargetIs(denial, `${targets.dataHomeRoot}/`))) return true;
  return isFileDenial(denial) && deniedTargetIs(denial, targets.probeFile);
}
