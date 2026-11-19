import { z } from 'zod';
import { type ProviderErrorSignal } from '../../providers';

/** How deep wrapped errors are followed (Mastra error -> AI SDK retry error -> API call error). */
const MAX_ERROR_DEPTH = 5;

const RETRY_AFTER_HEADER = 'retry-after';

// Only status codes, one header and an error code are read; messages and bodies never are,
// because a provider response can echo the request (prompt text) or a key.
const ErrorFactsSchema = z
  .object({
    statusCode: z.number().int().optional(),
    status: z.number().int().optional(),
    responseHeaders: z.record(z.string(), z.unknown()).optional(),
    code: z.string().max(64).optional(),
    cause: z.unknown().optional(),
    lastError: z.unknown().optional(),
    errors: z.array(z.unknown()).max(20).optional(),
  })
  .passthrough();

interface ErrorFacts {
  httpStatus: number | null;
  retryAfter: string | null;
  networkCode: string | null;
}

const NO_FACTS: ErrorFacts = { httpStatus: null, retryAfter: null, networkCode: null };

function merge(first: ErrorFacts, second: ErrorFacts): ErrorFacts {
  return {
    httpStatus: first.httpStatus ?? second.httpStatus,
    retryAfter: first.retryAfter ?? second.retryAfter,
    networkCode: first.networkCode ?? second.networkCode,
  };
}

function factsOf(value: unknown, depth: number): ErrorFacts {
  if (depth > MAX_ERROR_DEPTH || typeof value !== 'object' || value === null) return NO_FACTS;
  const parsed = ErrorFactsSchema.safeParse(value);
  if (!parsed.success) return NO_FACTS;
  const error = parsed.data;
  const retryAfter = error.responseHeaders?.[RETRY_AFTER_HEADER];
  const own: ErrorFacts = {
    httpStatus: error.statusCode ?? (error.status !== undefined && error.status >= 100 ? error.status : null),
    retryAfter: typeof retryAfter === 'string' ? retryAfter : null,
    networkCode: error.code ?? null,
  };
  const nested = [error.lastError, error.cause, ...(error.errors ?? [])].map((inner) => factsOf(inner, depth + 1));
  return nested.reduce(merge, own);
}

/**
 * The R1-11 `ProviderErrorSignal` of a failed live call, read structurally from whatever Mastra
 * or the AI SDK threw (the AI SDK `APICallError` carries `statusCode` and `responseHeaders`;
 * wrappers carry it as `cause` or `lastError`). The exact wrapping is an R1-FP check.
 */
export function providerErrorSignal(error: unknown, aborted: boolean): ProviderErrorSignal {
  return { provider: 'claude', ...factsOf(error, 0), aborted };
}
