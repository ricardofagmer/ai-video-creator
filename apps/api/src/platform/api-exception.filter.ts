import { randomUUID } from 'node:crypto';
import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { type ApiError } from '@studio/shared/api';
import { type Response } from 'express';
import { mapError, type MappedError } from './error-mapping';
import { RequestContext } from './request-context';

export function toErrorBody(mapped: MappedError, correlationId: string): ApiError {
  const details: NonNullable<ApiError['details']> = {};
  if (mapped.issues !== undefined && mapped.issues.length > 0) details.issues = mapped.issues;
  if (mapped.itemIds !== undefined) details.itemIds = mapped.itemIds;
  if (mapped.retryAfterSeconds !== undefined) details.retryAfterSeconds = mapped.retryAfterSeconds;
  if (mapped.conflicts !== undefined && mapped.conflicts.length > 0) details.conflicts = mapped.conflicts;
  const body: ApiError = { statusCode: mapped.statusCode, code: mapped.code, reason: mapped.reason, message: mapped.message, correlationId };
  if (Object.keys(details).length > 0) body.details = details;
  return body;
}

/**
 * The one place errors are handled (rules/base.md "handle once"). Clients get the C10 `ApiError`
 * shape with no path, query or stack; unexpected failures are logged with their stack on the
 * server, through the redacting logger.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly context: RequestContext) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = mapError(exception);
    const correlationId = this.context.correlationId() ?? randomUUID();
    this.log(exception, mapped, correlationId);

    if (response.headersSent) {
      // A stream failed after its headers went out; the client sees a truncated body, never a
      // second response.
      response.destroy();
      return;
    }
    if (mapped.retryAfterSeconds !== undefined) response.setHeader('Retry-After', String(mapped.retryAfterSeconds));
    response.status(mapped.statusCode).json(toErrorBody(mapped, correlationId));
  }

  private log(exception: unknown, mapped: MappedError, correlationId: string): void {
    const fields = { event: 'http.request-failed', statusCode: mapped.statusCode, code: mapped.code, reason: mapped.reason, correlationId };
    // Expected errors are logged without their message: a validation text may echo request input.
    if (mapped.expected) {
      this.logger.warn(fields);
      return;
    }
    const error = exception instanceof Error ? { name: exception.name, message: exception.message, stack: exception.stack ?? null } : { name: typeof exception };
    this.logger.error({ ...fields, error });
  }
}
