import 'reflect-metadata';
import { homedir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DATA_HOME_ENV_VAR, DataHome, resolveDataHome } from '@studio/core/paths';
import { RedactorService } from '@studio/core/redaction';
import { DaemonLoop } from './daemon/daemon-loop';
import { RedactingLogger } from './daemon/logging/redacting-logger';
import { installShutdownSignals, type ForcedExitCause } from './daemon/shutdown-signals';
import { WatcherDaemonModule } from './daemon/watcher-daemon.module';
import { acquireWatcherInstanceLock, type WatcherInstanceLock } from './daemon/watcher-instance.lock';

const LOG_CONTEXT = 'WatcherDaemon';

/** Upper bound on waiting for queued log lines before a forced or fatal exit. */
const EXIT_FLUSH_MS = 1000;

const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** A class name only: messages may quote paths or provider responses and are not redacted on this path. */
function errorLabel(error: unknown): string {
  const name = error instanceof Error ? error.name : 'NonErrorThrown';
  return ERROR_NAME_PATTERN.test(name) ? name : 'Error';
}

/**
 * Before the redactor exists (boot failure) nothing may be written from error text, so stderr
 * gets fixed words and the error class name. The plist sends stderr to `<data home>/logs/`.
 */
function writeBootFatal(event: string, error: unknown): void {
  process.stderr.write(`${JSON.stringify({ level: 'fatal', event, error: errorLabel(error) })}\n`);
}

async function exitAfterFlush(logger: RedactingLogger, code: number): Promise<void> {
  await Promise.race([logger.close(), sleep(EXIT_FLUSH_MS)]);
  process.exit(code);
}

function fatalExit(logger: RedactingLogger, event: string, error: unknown): void {
  if (logger.writing) logger.fatal({ event, error }, LOG_CONTEXT);
  else writeBootFatal(event, error);
  void exitAfterFlush(logger, 1);
}

/** The in-flight run keeps `running` with this dead pid; the next start crash-resumes it (criterion 13). */
function forcedExit(logger: RedactingLogger, cause: ForcedExitCause): void {
  if (logger.writing) logger.fatal({ event: 'watcher.forced-exit', cause }, LOG_CONTEXT);
  else process.stderr.write(`${JSON.stringify({ level: 'fatal', event: 'watcher.forced-exit', cause: cause.kind })}\n`);
  void exitAfterFlush(logger, 1);
}

/**
 * One watcher per data home (baseline review "single-instance lock"), taken before the Nest graph
 * boots, so a second daemon never writes a heartbeat, opens SQLite or claims a run. The data home is
 * resolved exactly as core `PathsModule` resolves it. Null when another live watcher holds the lock
 * or the lock could not be taken; stderr then carries fixed words only.
 */
async function takeInstanceLock(): Promise<WatcherInstanceLock | null> {
  try {
    const dataHome = resolveDataHome({ homeDirectory: homedir(), override: process.env[DATA_HOME_ENV_VAR] });
    const result = await acquireWatcherInstanceLock(dataHome.logs, { pid: process.pid });
    if (result.state === 'acquired') return result.lock;
    process.stderr.write(`${JSON.stringify({ level: 'fatal', event: 'watcher.already-running', ownerPid: result.pid })}\n`);
    return null;
  } catch (error) {
    writeBootFatal('watcher.lock-failed', error);
    return null;
  }
}

async function boot(logger: RedactingLogger, shutdown: AbortSignal): Promise<INestApplicationContext | null> {
  try {
    // `abortOnError: false`: a boot failure is thrown here and reported redaction-safe, never `process.abort()`.
    return await NestFactory.createApplicationContext(WatcherDaemonModule.register({ shutdown }), { logger, abortOnError: false });
  } catch (error) {
    // Lines Nest logged while booting are still unredacted in the logger's buffer; `close` drops and counts them.
    writeBootFatal('watcher.boot-failed', error);
    await logger.close();
    return null;
  }
}

/**
 * The launchd daemon (SPEC 0002 R1-09): boots the watcher as a standalone Nest application
 * context (D17, no HTTP listener), then executes runs one at a time until SIGTERM/SIGINT. Exit
 * codes: 0 after a graceful stop, 1 after a boot failure, a crash, a forced stop or when another
 * live watcher holds `logs/watcher.lock`. The plist's `KeepAlive = true` restarts it after
 * either, and the run a shutdown left `running` resumes.
 */
async function main(): Promise<void> {
  const logger = new RedactingLogger();
  const signals = installShutdownSignals({
    onShutdownRequested: (signal) => logger.log({ event: 'watcher.shutdown-requested', signal }, LOG_CONTEXT),
    onForcedExit: (cause) => forcedExit(logger, cause),
  });
  process.on('uncaughtException', (error) => fatalExit(logger, 'watcher.uncaught-exception', error));
  process.on('unhandledRejection', (reason) => fatalExit(logger, 'watcher.unhandled-rejection', reason));

  const lock = await takeInstanceLock();
  if (lock === null) {
    signals.dispose();
    process.exitCode = 1;
    return;
  }
  // A forced or fatal exit ends in `process.exit`, which runs only synchronous listeners.
  process.once('exit', () => lock.releaseSync());
  try {
    const app = await boot(logger, signals.signal);
    if (app === null) {
      process.exitCode = 1;
      return;
    }
    try {
      await logger.attach({ redactor: app.get(RedactorService), logsDirectory: app.get(DataHome).logs });
      logger.log({ event: 'watcher.started', pid: process.pid }, LOG_CONTEXT);
      await app.get(DaemonLoop).run();
      logger.log({ event: 'watcher.stopped', reason: 'shutdown' }, LOG_CONTEXT);
    } finally {
      // Before the context closes: redaction reads registered biometric paths through Prisma.
      await logger.flush();
      await app.close();
      await logger.close();
    }
  } finally {
    // Last, after every run file and the database are closed; only this process's lock is removed.
    await lock.release();
    signals.dispose();
  }
}

main().catch((error: unknown) => {
  // Reached after the logger closed (a failing `app.close`, a loop invariant): class name only.
  writeBootFatal('watcher.failed', error);
  process.exitCode = 1;
});
