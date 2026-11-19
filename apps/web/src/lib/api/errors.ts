import { ApiErrorSchema, type ApiError, type ApiIssue } from '@studio/shared/api';

/**
 * Failures of a C10 call, as typed errors the UI switches on (`status`, `reason`). Messages are
 * English and never shown verbatim: screens map `reason` to pt-BR text.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    /** The C10 `ApiError` body, or null when the response carried none that parses. */
    readonly body: ApiError | null,
  ) {
    super(`Api request failed with status ${status}${body === null ? '' : ` (${body.reason})`}`);
    this.name = 'ApiRequestError';
  }

  get reason(): string | null {
    return this.body?.reason ?? null;
  }

  get issues(): readonly ApiIssue[] {
    return this.body?.details?.issues ?? [];
  }
}

/** The api (or the BFF in front of it) could not be reached at all. */
export class ApiUnreachableError extends Error {
  constructor() {
    super('The local api could not be reached');
    this.name = 'ApiUnreachableError';
  }
}

/** A success response whose body does not match the C10 schema: a contract drift, never shown raw. */
export class ApiResponseContractError extends Error {
  constructor(
    readonly path: string,
    readonly issues: readonly string[],
  ) {
    super(`Api response for ${path} does not match contract C10`);
    this.name = 'ApiResponseContractError';
  }
}

/** A request body the caller built does not match its C10 schema; nothing was sent. */
export class ApiRequestContractError extends Error {
  constructor(readonly issues: readonly ApiIssue[]) {
    super('Request does not match contract C10');
    this.name = 'ApiRequestContractError';
  }
}

/** Parses an error body with the C10 `ApiErrorSchema`; anything else becomes null. */
export function parseApiErrorBody(raw: unknown): ApiError | null {
  const parsed = ApiErrorSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}
