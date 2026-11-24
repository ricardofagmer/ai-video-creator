import { spawn, type ChildProcess } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { HealthResponseSchema } from '@studio/shared/api';
import { isProcessAlive } from '@studio/shared/run-files';
import {
  ServiceExitedOnStartError,
  ServiceNotBuiltError,
  ServicePortInUseError,
  ServiceProcessMismatchError,
  ServiceStillRunningError,
} from '../errors/service.errors.js';
import { probeLoopback, type HttpProbe } from '../doctor/http-probe.js';
import { isLaunchedService, isPortTaken, readCommandLine } from './process-identity.js';
import { readPidFile, removePidFile, writePidFile } from './service-pid-file.js';
import { type ServiceSpec } from './service-spec.js';

/** `next start` needs a few seconds to load the build; past this the start is reported unconfirmed. */
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 500;
const STOP_GRACE_MS = 10_000;
const KILL_GRACE_MS = 2000;
const STOP_POLL_MS = 200;
const PROCESS_LOG_MODE = 0o600;

export type StartOutcome =
  | { status: 'started'; pid: number; port: number; ready: boolean }
  | { status: 'already-running'; pid: number; port: number };

export type StopOutcome = { status: 'stopped'; pid: number } | { status: 'not-running' } | { status: 'stale-record-removed' };

/** What a pid record says the process is: the entry file it ran and the port it bound. */
interface RecordedIdentity {
  entryPath: string;
  port: number;
}

/**
 * `ours` is a live process still running the entry file its own record names. `current` is true
 * when that entry file is this copy's: a service another app copy started (an older install, a
 * moved app) is ours to stop but is not this copy's running service.
 */
type RecordedProcess =
  | { status: 'none' }
  | { status: 'ours'; pid: number; current: boolean; identity: RecordedIdentity }
  | { status: 'foreign'; pid: number };

/**
 * What the pid file names, checked against the live process table. A dead pid, an invalid record
 * or a vanished process clears the record; a live process that no longer runs the recorded entry
 * file (pid reuse, a hand edit) is `foreign`.
 */
async function recordedProcess(spec: ServiceSpec): Promise<RecordedProcess> {
  const read = await readPidFile(spec.pidFile);
  if (read.status === 'absent') return { status: 'none' };
  if (read.status === 'invalid') {
    await removePidFile(spec.pidFile);
    return { status: 'none' };
  }
  const { pid, entryPath, port } = read.record;
  const commandLine = isProcessAlive(pid) ? await readCommandLine(pid, spec.env) : null;
  if (commandLine === null) {
    await removePidFile(spec.pidFile);
    return { status: 'none' };
  }
  const identity: RecordedIdentity = { entryPath, port };
  if (!(await runsRecordedEntry(spec, { identity, pid, commandLine }))) return { status: 'foreign', pid };
  return { status: 'ours', pid, current: entryPath === spec.entryPath, identity };
}

interface LiveProcess {
  identity: RecordedIdentity;
  pid: number;
  commandLine: string;
}

/** The identity comes from the record, not from this copy's spec, so another copy's service is recognised. */
function runsRecordedEntry(spec: ServiceSpec, live: LiveProcess): Promise<boolean> {
  return isLaunchedService({
    pid: live.pid,
    commandLine: live.commandLine,
    entryPath: live.identity.entryPath,
    port: live.identity.port,
    processTitlePrefix: spec.processTitlePrefix,
    environment: spec.env,
  });
}

function isReady(spec: ServiceSpec, probe: HttpProbe): boolean {
  if (probe.status !== 'up') return false;
  if (spec.name === 'api') return probe.httpStatus === 200 && HealthResponseSchema.safeParse(probe.body).success;
  return probe.httpStatus < 500;
}

function waitForSpawn(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => {
      if (child.pid === undefined) reject(new Error('spawned child has no pid'));
      else resolve(child.pid);
    });
  });
}

/**
 * Detached (own process group, so `stop` can signal the whole service and the CLI may exit),
 * stdout/stderr appended to the process log, fixed argv, no shell, explicit environment.
 */
async function launch(spec: ServiceSpec): Promise<{ child: ChildProcess; pid: number }> {
  await mkdir(dirname(spec.processLog), { recursive: true, mode: 0o700 });
  const log = await open(spec.processLog, 'a', PROCESS_LOG_MODE);
  try {
    const child = spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: { ...spec.env },
      detached: true,
      shell: false,
      stdio: ['ignore', log.fd, log.fd],
      windowsHide: true,
    });
    const pid = await waitForSpawn(child);
    child.unref();
    return { child, pid };
  } finally {
    // The child holds its own copy of the descriptor; the CLI's copy is no longer needed.
    await log.close();
  }
}

async function waitUntilReady(spec: ServiceSpec, child: ChildProcess, signal: AbortSignal): Promise<boolean> {
  let exited = child.exitCode !== null || child.signalCode !== null;
  child.once('exit', () => {
    exited = true;
  });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) {
      await removePidFile(spec.pidFile);
      throw new ServiceExitedOnStartError(spec.name, spec.processLog);
    }
    if (isReady(spec, await probeLoopback(spec.port, spec.healthPath))) return true;
    await delay(READY_POLL_MS, undefined, { signal });
  }
  return false;
}

/**
 * `studio start <service>` (D9): one process per service, bound to `127.0.0.1` by its own
 * listener, recorded in its pid file. A recorded live process is left alone; a port held by any
 * other process is refused rather than raced.
 */
export async function startService(spec: ServiceSpec, signal: AbortSignal): Promise<StartOutcome> {
  const recorded = await recordedProcess(spec);
  if (recorded.status === 'ours' && recorded.current) return { status: 'already-running', pid: recorded.pid, port: spec.port };
  // A foreign pid in the record is pid reuse (reboot) or a hand edit: never ours to signal, so the
  // record goes and the port check below decides. A service another app copy started keeps its
  // record, so `stop` can still stop it; while it listens the port check refuses this start.
  if (recorded.status === 'foreign') await removePidFile(spec.pidFile);
  try {
    await access(spec.entryPath, constants.R_OK);
  } catch {
    // Missing or unreadable entry file: the workspace was not built (or not installed).
    throw new ServiceNotBuiltError(spec.name, spec.entryPath);
  }
  if (await isPortTaken(spec.port)) throw new ServicePortInUseError(spec.name, spec.port);
  signal.throwIfAborted();
  const { child, pid } = await launch(spec);
  await writePidFile(spec.pidFile, { service: spec.name, pid, startedAt: new Date().toISOString(), entryPath: spec.entryPath, port: spec.port });
  const ready = await waitUntilReady(spec, child, signal);
  return { status: 'started', pid, port: spec.port, ready };
}

/** Signals the process group the CLI created (detached child: group id = pid). */
function signalGroup(pid: number, signalName: 'SIGTERM' | 'SIGKILL'): void {
  try {
    process.kill(-pid, signalName);
  } catch (error) {
    const code: unknown = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    // ESRCH: the group is already gone, which is what stop wants.
    if (code !== 'ESRCH') throw error;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await delay(STOP_POLL_MS);
  }
  return !isProcessAlive(pid);
}

/**
 * `studio stop <service>`: signals only the pid this CLI recorded, and only after `ps` shows that
 * pid still runs the recorded entry file, whichever app copy started it (an upgrade stops the
 * previous copy's service this way). SIGTERM first (graceful Nest/Next shutdown), SIGKILL after
 * the grace period, with the command line verified again before the second signal.
 */
export async function stopService(spec: ServiceSpec): Promise<StopOutcome> {
  const hadRecord = (await readPidFile(spec.pidFile)).status !== 'absent';
  const recorded = await recordedProcess(spec);
  if (recorded.status === 'none') return hadRecord ? { status: 'stale-record-removed' } : { status: 'not-running' };
  if (recorded.status === 'foreign') {
    await removePidFile(spec.pidFile);
    throw new ServiceProcessMismatchError(spec.name, recorded.pid);
  }
  const { pid, identity } = recorded;
  signalGroup(pid, 'SIGTERM');
  if (!(await waitForExit(pid, STOP_GRACE_MS))) {
    const commandLine = await readCommandLine(pid, spec.env);
    if (commandLine !== null && (await runsRecordedEntry(spec, { identity, pid, commandLine }))) {
      signalGroup(pid, 'SIGKILL');
      if (!(await waitForExit(pid, KILL_GRACE_MS))) throw new ServiceStillRunningError(spec.name, pid);
    }
  }
  await removePidFile(spec.pidFile);
  return { status: 'stopped', pid };
}

export type ServiceState = { status: 'running'; pid: number } | { status: 'not-running' } | { status: 'foreign-record'; pid: number };

/** For `doctor`: what the pid record says, without signalling or rewriting anything but stale records. */
export async function serviceState(spec: ServiceSpec): Promise<ServiceState> {
  const recorded = await recordedProcess(spec);
  if (recorded.status === 'none') return { status: 'not-running' };
  // Another copy's service is not this studio's running service: `doctor` reports its record as foreign.
  if (recorded.status === 'ours' && recorded.current) return { status: 'running', pid: recorded.pid };
  return { status: 'foreign-record', pid: recorded.pid };
}
