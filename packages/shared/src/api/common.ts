import { z } from 'zod';
import { CorrelationIdSchema } from '../common/ids';

/**
 * Contract C10 (SPEC 0002, owner ticket R1-16): the api HTTP contract consumed by the web (R1-19,
 * R1-20). Browser-safe: zod only, no Node or Nest import. A change after freeze bumps this number
 * and goes back to its owner ticket. Revision 2 (SPEC 0002 rev 4, owner R1-24) adds `GET /watcher`,
 * the by-reference routes and the fields of section 13.2; every addition is additive. Revision 3
 * (SPEC 0003 section 4.3, owner R2-01) adds the R2 routes and fields and makes one **breaking**
 * change: `PUT .../status` refuses `active` with 422 `promotion-approval-required`. Revision 4
 * (SPEC 0005 section 4.4, owner C5-01) adds the four curation routes; every addition is additive.
 * Revision 5 (SPEC 0006 section 4.4, owner R3-01) adds the publication, metrics and schedule routes
 * and the fields `qualityPlatformSampleSize`, `schedule` and `publicationCount`; every addition is
 * additive.
 */
export const API_CONTRACT_REVISION = 5;

/** Request header the api copies into `correlationId`; echoed on every response. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** httpOnly, `SameSite=Lax` session cookie set by `POST /auth/login` (D8). */
export const SESSION_COOKIE_NAME = 'studio_session';

/** Stable error taxonomy (rules/observability.md); clients switch on `code` and `reason`. */
export const ApiErrorCodeSchema = z.enum(['validation', 'auth', 'not_found', 'conflict', 'rate_limited', 'dependency', 'internal']);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** One input problem: where, and either a zod issue code (request shape) or a domain message. */
export const ApiIssueSchema = z
  .object({
    path: z.string().max(200),
    code: z.string().max(64).optional(),
    message: z.string().max(500).optional(),
  })
  .strict();
export type ApiIssue = z.infer<typeof ApiIssueSchema>;

/**
 * Every error body. `reason` is the kebab-case name of the typed error (e.g. `asset-not-found`).
 * `message` never carries a file path, a query or a stack trace.
 */
export const ApiErrorSchema = z
  .object({
    statusCode: z.number().int().min(400).max(599),
    code: ApiErrorCodeSchema,
    reason: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
    message: z.string().max(2000),
    correlationId: CorrelationIdSchema,
    details: z
      .object({
        issues: z.array(ApiIssueSchema).max(50).optional(),
        /** Required review checklist items left unchecked (`required-checklist-unchecked`). */
        itemIds: z.array(z.string().max(64)).max(20).optional(),
        /** Seconds until the next login attempt is accepted (`login-rate-limited`). */
        retryAfterSeconds: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Rev 3 (SPEC 0003 section 4.3): the `ApiError.reason` values R2 adds, with their status codes.
 * No error body carries a note's text, a query, a promotion reason or a model file path.
 */
export const apiRev3ErrorReasons = Object.freeze({
  'promotion-approval-required': 422,
  'promotion-ref-mismatch': 422,
  'learning-ref-not-used': 422,
  'learning-contains-secret': 422,
  'learning-limit-reached': 422,
  'learning-biometric-refused': 422,
  'comparison-subject-invalid': 422,
  'comparison-biometric-refused': 422,
  'comparison-over-month-ceiling': 422,
  'comparison-estimate-changed': 409,
  'comparison-not-startable': 409,
  'learning-run-not-reviewed': 409,
  'embedding-unavailable': 503,
  'month-spend-unavailable': 503,
});

/**
 * Rev 4 (SPEC 0005 section 4.4): the `ApiError.reason` values the curation routes add, with their
 * status codes. `month-spend-unavailable` (503) is reused from rev 3, and `compare` passes the
 * comparison reasons through unchanged. No error body carries a body, focus, reason or diff text.
 */
export const apiRev4ErrorReasons = Object.freeze({
  'curation-subject-not-found': 404,
  'curation-not-found': 404,
  'curation-subject-not-curatable': 422,
  'curation-subject-biometric': 422,
  'curation-subject-deprecated': 422,
  'curation-subject-body-too-large': 422,
  'curation-no-reviewed-runs': 422,
  'curation-over-month-ceiling': 422,
  'curation-queue-full': 409,
  'curation-already-requested': 409,
  'curation-estimate-changed': 409,
  'curation-not-decidable': 409,
  'curation-already-decided': 409,
  'curation-not-saved': 409,
  'curation-subject-refused': 409,
});

/**
 * Rev 5 (SPEC 0006 section 4.4): the `ApiError.reason` values the publication, metrics and schedule
 * routes add, with their status codes. Nothing is written on a refusal. No error body carries a
 * URL, a cell, a file name or brief text. The owner-facing pt-BR texts are the web's, as for rev 4.
 */
export const apiRev5ErrorReasons = Object.freeze({
  'publication-run-not-approved': 409,
  'publication-url-not-recognized': 422,
  'publication-short-link-refused': 422,
  'publication-already-linked': 409,
  'publication-limit-reached': 422,
  'publication-has-metrics': 409,
  'publication-not-found': 404,
  'schedule-not-found': 404,
  'metrics-as-of-in-future': 422,
  'metrics-file-too-large': 413,
  'metrics-not-csv': 422,
  'metrics-too-many-rows': 422,
  'metrics-required-column-missing': 422,
  'metrics-empty-file': 422,
  'schedule-limit-reached': 422,
  'schedule-recipe-not-runnable': 422,
  'schedule-estimate-changed': 409,
  'schedule-time-invalid': 422,
  'schedule-not-editable': 409,
  'invalid-schedule-input': 422,
  'schedule-brief-change-refused': 409,
  'schedule-file-corrupt': 500,
  'invalid-metrics-input': 422,
  'metrics-snapshot-limit-reached': 422,
  'metrics-row-corrupt': 500,
});
export type ApiRev5ErrorReason = keyof typeof apiRev5ErrorReasons;

/** rules/backend.md pagination: default 20, max 100. */
export const API_DEFAULT_PAGE_LIMIT = 20;
export const API_MAX_PAGE_LIMIT = 100;

/** A decimal query-string integer in `[min, max]`; query values always arrive as text. */
export function queryInteger(min: number, max: number): z.ZodType<number, string> {
  return z
    .string()
    .regex(/^[0-9]{1,16}$/, 'expected a decimal integer')
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => Number.isSafeInteger(value) && value >= min && value <= max, { message: `expected ${min}..${max}` });
}

/** A comma-separated query list whose items each satisfy `item` (e.g. `statuses=draft,active`). */
export function queryList<Item extends z.ZodType<unknown, string>>(item: Item, maxItems: number): z.ZodType<z.output<Item>[], string> {
  const items: z.ZodType<z.output<Item>[], string[]> = z.array(item).min(1).max(maxItems);
  return z
    .string()
    .max(1000)
    .transform((value) => value.split(',').map((part) => part.trim()))
    .pipe(items);
}

export const PageLimitQuerySchema = queryInteger(1, API_MAX_PAGE_LIMIT);

/** A page of a list endpoint; pass `nextCursor` back as `cursor`; null on the last page. */
export interface Page<Item> {
  items: Item[];
  /** Matching items in total, independent of the cursor. */
  total: number;
  nextCursor: string | null;
}

export function pageOf<Item extends z.ZodTypeAny>(item: Item): z.ZodType<Page<z.output<Item>>, unknown> {
  return z
    .object({
      items: z.array(item).max(API_MAX_PAGE_LIMIT),
      total: z.number().int().nonnegative(),
      nextCursor: z.string().max(64).nullable(),
    })
    .strict();
}
