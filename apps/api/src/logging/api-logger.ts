import { join } from 'node:path';
import { Injectable, type LoggerService, type OnApplicationShutdown } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { RedactorService } from '@studio/core/redaction';
import pino, { type Logger as PinoLogger } from 'pino';
import { RequestContext } from '../platform/request-context';
import {
  redactionFailureNotice,
  safeContext,
  toLogRecord,
  toPinoArguments,
  toRedactableJson,
  type ApiLogLevel,
  type LogRecord,
} from './log-record';

/** pino JSON lines under `<data home>/logs/` (D5), beside the watcher's log. */
export const API_LOG_FILE_NAME = 'api.log';

/** Owner-only: lines are redacted, yet they still name run ids and asset ids. */
const API_LOG_FILE_MODE = 0o600;

/**
 * The api's Nest logger. Every record goes through core redaction (criterion 21: key values and
 * secret patterns become `<redacted>`, registered biometric paths `<biometric-ref>`) before pino
 * writes it. A record whose redaction fails is replaced by a fixed line, never written raw.
 */
@Injectable()
export class ApiLogger implements LoggerService, OnApplicationShutdown {
  private readonly destination: PinoLogger;

  constructor(
    private readonly redactor: RedactorService,
    private readonly context: RequestContext,
    dataHome: DataHome,
  ) {
    this.destination = pino(
      { base: { service: 'api' }, level: 'info', timestamp: pino.stdTimeFunctions.isoTime },
      pino.destination({ dest: join(dataHome.logs, API_LOG_FILE_NAME), mkdir: true, sync: false, mode: API_LOG_FILE_MODE }),
    );
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write(toLogRecord('info', message, optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write(toLogRecord('error', message, optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write(toLogRecord('warn', message, optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write(toLogRecord('debug', message, optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write(toLogRecord('debug', message, optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write(toLogRecord('fatal', message, optionalParams));
  }

  onApplicationShutdown(): void {
    this.destination.flush();
  }

  private write(record: LogRecord): void {
    const notice = redactionFailureNotice(record);
    if (notice !== null) {
      this.destination.warn(notice);
      return;
    }
    // Captured synchronously: the redaction below resolves outside the request's async context.
    const correlationId = this.context.correlationId();
    this.redactAndWrite(record, correlationId).catch(() => this.destination.error({ event: 'log.write-failed' }));
  }

  private async redactAndWrite(record: LogRecord, correlationId: string | null): Promise<void> {
    const result = await this.redactor.redactJson(toRedactableJson(record));
    if (result.status === 'failed') {
      this.emit(record.level, { event: 'log.redaction-failed', reason: result.reason, context: safeContext(record.context) }, undefined);
      return;
    }
    const { fields, text } = toPinoArguments(result.value);
    const merged = correlationId !== null && fields.correlationId === undefined ? { ...fields, correlationId } : fields;
    this.emit(record.level, merged, text);
  }

  private emit(level: ApiLogLevel, fields: object, text: string | undefined): void {
    if (text === undefined) this.destination[level](fields);
    else this.destination[level](fields, text);
  }
}
