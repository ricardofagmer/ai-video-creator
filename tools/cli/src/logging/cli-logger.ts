import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type LoggerService } from '@nestjs/common';
import { type RedactionResult } from '@studio/core/redaction';
import { type JsonObject, type JsonValue } from '@studio/shared/run-format';
import { isRedactorFailureNotice, toLogRecord, toRedactableJson, type CliLogLevel, type LogRecord } from './log-record.js';

/** JSON lines under `<data home>/logs/` (D5), beside `api.log` and `watcher.log`. */
export const CLI_LOG_FILE_NAME = 'cli.log';

/** Owner-only: lines are redacted, yet they still name run ids and asset ids. */
const CLI_LOG_FILE_MODE = 0o600;

/** Lines kept while the Nest context boots and the redactor does not exist yet. */
const MAX_BUFFERED_LINES = 500;

/** The part of core `RedactorService` the logger uses (criterion 21; fails closed). */
export interface LineRedactor {
  redactJson(value: JsonValue): Promise<RedactionResult<JsonValue>>;
}

interface Sink {
  redactor: LineRedactor;
  file: string;
}

type LoggerState = { phase: 'buffering'; buffered: LogRecord[] } | { phase: 'writing'; sink: Sink } | { phase: 'closed' };

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Nest `LoggerService` of the CLI. Nothing goes to the terminal: the Ink dashboard owns the
 * screen, and command output is the printer's job. Every line passes through core redaction
 * before it reaches `cli.log`; until `attach` supplies the redactor, lines are held in memory and
 * dropped if boot fails, never written unredacted.
 */
export class CliLogger implements LoggerService {
  private state: LoggerState = { phase: 'buffering', buffered: [] };
  private queue: Promise<void> = Promise.resolve();
  private lostLines = 0;

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

  // `debug` and `verbose` are left out on purpose: Nest skips levels a LoggerService lacks.

  /** Starts writing (owner-only file) and flushes the lines held since boot, redacted. */
  async attach(redactor: LineRedactor, logsDirectory: string): Promise<void> {
    const booting = this.state;
    if (booting.phase !== 'buffering') return;
    const file = join(logsDirectory, CLI_LOG_FILE_NAME);
    await appendFile(file, '', { mode: CLI_LOG_FILE_MODE });
    const sink: Sink = { redactor, file };
    this.state = { phase: 'writing', sink };
    for (const record of booting.buffered) this.enqueue(sink, record);
    await this.queue;
  }

  /** Writes the queued lines, then stops; call it before the redactor's Prisma connection closes. */
  async close(): Promise<void> {
    const previous = this.state;
    if (previous.phase === 'buffering') this.lostLines += previous.buffered.length;
    if (previous.phase === 'writing') await this.queue;
    this.state = { phase: 'closed' };
  }

  /** Lines dropped (boot failure, closed logger, failed writes); reported as a count only. */
  get droppedLines(): number {
    return this.lostLines;
  }

  private accept(record: LogRecord): void {
    const state = this.state;
    if (state.phase === 'writing') {
      this.enqueue(state.sink, record);
      return;
    }
    if (state.phase === 'closed' || state.buffered.length >= MAX_BUFFERED_LINES) {
      this.lostLines += 1;
      return;
    }
    state.buffered.push(record);
  }

  private enqueue(sink: Sink, record: LogRecord): void {
    this.queue = this.queue
      .then(() => this.write(sink, record))
      .catch(() => {
        // A failed write cannot be logged to the same file; it is counted instead.
        this.lostLines += 1;
      });
  }

  private async write(sink: Sink, record: LogRecord): Promise<void> {
    if (isRedactorFailureNotice(record)) {
      await this.append(sink.file, record.level, { event: 'redaction.failed', context: 'RedactorService' });
      return;
    }
    const result = await sink.redactor.redactJson(toRedactableJson(record));
    if (result.status === 'failed') {
      await this.append(sink.file, 'error', { event: 'log.redaction-failed', reason: result.reason, context: record.context });
      return;
    }
    const redacted = result.value;
    const fields: JsonObject = isJsonObject(redacted) ? redacted : { data: redacted };
    const { message, ...rest } = fields;
    const merged: JsonObject = message !== undefined && isJsonObject(message) ? { ...rest, ...message } : fields;
    await this.append(sink.file, record.level, merged);
  }

  private async append(file: string, level: CliLogLevel, fields: JsonObject): Promise<void> {
    const line = JSON.stringify({ time: new Date().toISOString(), level, service: 'cli', pid: process.pid, ...fields });
    await appendFile(file, `${line}\n`, { mode: CLI_LOG_FILE_MODE });
  }
}
