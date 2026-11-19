import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type LoggerService } from '@nestjs/common';
import { type RedactionResult } from '@studio/core/redaction';
import { type JsonObject, type JsonValue } from '@studio/shared/run-format';
import { destination as pinoDestination, pino, type Logger as PinoLogger } from 'pino';
import { DAEMON_LOG_FILE_MODE, DAEMON_LOG_FILE_NAME } from '../daemon.settings';
import {
  redactionFailureNotice,
  safeContext,
  toLogRecord,
  toPinoArguments,
  toRedactableJson,
  type DaemonLogLevel,
  type LogRecord,
} from './log-record.mapper';

/** The part of core `RedactorService` the logger uses (criterion 21; fails closed). */
export interface LineRedactor {
  redactJson(value: JsonValue): Promise<RedactionResult<JsonValue>>;
}

export interface LogSinkOptions {
  redactor: LineRedactor;
  /** `<data home>/logs`, from core `DataHome`. */
  logsDirectory: string;
}

type Destination = ReturnType<typeof pinoDestination>;

interface Sink {
  redactor: LineRedactor;
  destination: Destination;
  pino: PinoLogger;
}

type LoggerState = { phase: 'buffering'; buffered: LogRecord[] } | { phase: 'writing'; sink: Sink } | { phase: 'closed' };

/** Lines kept while the Nest context boots and the redactor does not exist yet. */
const MAX_BUFFERED_LINES = 1000;

/**
 * Nest `LoggerService` of the daemon: pino JSON lines in `<data home>/logs/watcher.log`, every line
 * passed through core redaction first (topology section 8, criterion 21). Until `attach` supplies
 * the redactor, lines are held in memory; they are never written unredacted, so lines from a boot
 * that fails are dropped and only counted. A line whose redaction fails is replaced by a notice
 * holding the failure reason, never the original text. Writes are queued, so lines keep their order.
 */
export class RedactingLogger implements LoggerService {
  private state: LoggerState = { phase: 'buffering', buffered: [] };
  private queue: Promise<void> = Promise.resolve();
  private droppedLines = 0;
  private failedWrites = 0;

  /** True once lines reach the file; before that a caller with a fatal error must report it another way. */
  get writing(): boolean {
    return this.state.phase === 'writing';
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.accept(toLogRecord('info', message, optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.accept(toLogRecord('error', message, optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.accept(toLogRecord('warn', message, optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.accept(toLogRecord('fatal', message, optionalParams));
  }

  // `debug` and `verbose` are left out on purpose: Nest skips optional levels a LoggerService does not
  // implement, so lines below the daemon's `info` level are neither redacted nor written.

  /** Opens the log file (owner-only) and writes the lines held since boot, redacted. */
  async attach(options: LogSinkOptions): Promise<void> {
    const booting = this.state;
    if (booting.phase !== 'buffering') return;
    const file = join(options.logsDirectory, DAEMON_LOG_FILE_NAME);
    // Creates the file with the mode when absent; pino would create it with the process umask.
    await appendFile(file, '', { mode: DAEMON_LOG_FILE_MODE });
    // Synchronous writes: the daemon logs a few lines per run, and a forced exit must not lose them.
    const destination = pinoDestination({ dest: file, sync: true });
    const sink: Sink = {
      redactor: options.redactor,
      destination,
      pino: pino(
        {
          level: 'info',
          // No hostname: the machine name is not needed to read a local daemon's log.
          base: { service: 'watcher', pid: process.pid },
          timestamp: pino.stdTimeFunctions.isoTime,
          formatters: { level: (label: string): JsonObject => ({ level: label }) },
        },
        destination,
      ),
    };
    if (this.state !== booting) {
      // Closed while the file was opening: `close` already counted the held lines.
      destination.end();
      return;
    }
    this.state = { phase: 'writing', sink };
    for (const record of booting.buffered) this.enqueue(sink, record);
    await this.queue;
  }

  /** Waits until every queued line is written; call it before the redactor's Prisma connection closes. */
  async flush(): Promise<void> {
    await this.queue;
  }

  /** Waits for queued lines and closes the file. Lines logged afterwards are counted, not written. */
  async close(): Promise<void> {
    const previous = this.state;
    this.state = { phase: 'closed' };
    if (previous.phase === 'buffering') this.droppedLines += previous.buffered.length;
    if (previous.phase === 'writing') {
      await this.queue;
      previous.sink.destination.end();
    }
    this.reportLosses();
  }

  private accept(record: LogRecord): void {
    const state = this.state;
    if (state.phase === 'writing') {
      this.enqueue(state.sink, record);
      return;
    }
    // Closed: the file is gone and the process is exiting. Buffer full: boot is logging in a loop.
    if (state.phase === 'closed' || state.buffered.length >= MAX_BUFFERED_LINES) {
      this.droppedLines += 1;
      return;
    }
    state.buffered.push(record);
  }

  private enqueue(sink: Sink, record: LogRecord): void {
    this.queue = this.queue
      .then(() => this.write(sink, record))
      .catch(() => {
        // A failed file write cannot be logged to the same file; it is counted and reported at close.
        this.failedWrites += 1;
      });
  }

  private async write(sink: Sink, record: LogRecord): Promise<void> {
    const notice = redactionFailureNotice(record);
    if (notice !== null) {
      this.emit(sink, record.level, notice, undefined);
      return;
    }
    const result = await sink.redactor.redactJson(toRedactableJson(record));
    if (result.status === 'failed') {
      this.emit(sink, 'error', { event: 'log.redaction-failed', reason: result.reason, context: safeContext(record.context) }, undefined);
      return;
    }
    const { fields, text } = toPinoArguments(result.value);
    this.emit(sink, record.level, fields, text);
  }

  private emit(sink: Sink, level: DaemonLogLevel, fields: JsonObject, text: string | undefined): void {
    if (text === undefined) sink.pino[level](fields);
    else sink.pino[level](fields, text);
  }

  /** Counts and fixed words only, on stderr (the plist sends it to `logs/`): nothing here needs redaction. */
  private reportLosses(): void {
    if (this.droppedLines === 0 && this.failedWrites === 0) return;
    process.stderr.write(`${JSON.stringify({ level: 'warn', event: 'log.lines-lost', dropped: this.droppedLines, failedWrites: this.failedWrites })}\n`);
  }
}
