import { REQUEST_ID_HEADER, type ApiIssue } from '@studio/shared/api';
import { type z } from 'zod';
import {
  ApiRequestContractError,
  ApiRequestError,
  ApiResponseContractError,
  ApiUnreachableError,
  parseApiErrorBody,
} from './errors';
import { type ApiMethod } from './route-table';

/** One HTTP exchange, as the transport sees it; the path is an `apiPaths` value plus query. */
export interface TransportRequest {
  method: ApiMethod;
  path: string;
  headers: Readonly<Record<string, string>>;
  body: string | FormData | null;
  signal?: AbortSignal;
}

/**
 * Sends one request somewhere that speaks C10: the browser transport goes through the web's BFF,
 * the server transport calls the api directly. Rejects only when nothing answered.
 */
export type ApiTransport = (request: TransportRequest) => Promise<Response>;

export type ApiRequestBody = { kind: 'json'; value: unknown } | { kind: 'multipart'; value: FormData };

/** Query values as the C10 query schemas read them: text, joined with commas for lists. */
export type ApiQuery = Readonly<Record<string, string | number | readonly string[] | undefined>>;

export interface ApiCall {
  method: ApiMethod;
  /** A path from `apiPaths` (C10 `routes.ts`). */
  path: string;
  query?: ApiQuery;
  body?: ApiRequestBody;
  signal?: AbortSignal;
}

export function toQueryString(query: ApiQuery | undefined): string {
  if (query === undefined) return '';
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      if (value !== '') parameters.set(name, String(value));
      continue;
    }
    if (value.length > 0) parameters.set(name, value.join(','));
  }
  const text = parameters.toString();
  return text === '' ? '' : `?${text}`;
}

/** Validates a request body with its C10 schema before anything is sent. */
export function checkedBody<Schema extends z.ZodTypeAny>(schema: Schema, value: z.input<Schema>): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues: ApiIssue[] = parsed.error.issues.slice(0, 50).map((issue) => ({
      path: issue.path.join('.').slice(0, 200),
      code: issue.code,
      message: issue.message.slice(0, 500),
    }));
    throw new ApiRequestContractError(issues);
  }
  return parsed.data;
}

async function send(transport: ApiTransport, call: ApiCall): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | FormData | null = null;
  if (call.body?.kind === 'json') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(call.body.value);
  } else if (call.body?.kind === 'multipart') {
    // The runtime sets the multipart boundary itself.
    body = call.body.value;
  }
  let response: Response;
  try {
    response = await transport({ method: call.method, path: `${call.path}${toQueryString(call.query)}`, headers, body, signal: call.signal });
  } catch (error) {
    // fetch rejects with TypeError when nothing answers; a timeout is the same to the owner.
    // Anything else (an abort by the caller, a framework redirect) keeps its own meaning.
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    if (error instanceof TypeError || timedOut) throw new ApiUnreachableError();
    throw error;
  }
  if (!response.ok) throw new ApiRequestError(response.status, parseApiErrorBody(await readJson(response)));
  return response;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** One C10 call whose success body is parsed with `schema` (zod at the boundary). */
export async function requestJson<Schema extends z.ZodTypeAny>(transport: ApiTransport, call: ApiCall, schema: Schema): Promise<z.output<Schema>> {
  const response = await send(transport, call);
  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new ApiResponseContractError(
      call.path,
      parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.')}: ${issue.code}`),
    );
  }
  return parsed.data;
}

/** One C10 call that answers 204 (or any success without a body the caller needs). */
export async function requestNoContent(transport: ApiTransport, call: ApiCall): Promise<void> {
  const response = await send(transport, call);
  await response.body?.cancel();
}

/** Request id for one call; the api keeps it as `correlationId` when it matches its allowlist. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

export { REQUEST_ID_HEADER };
