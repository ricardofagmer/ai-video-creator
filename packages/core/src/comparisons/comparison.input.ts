import { z } from 'zod';
import { CreateComparisonRequestSchema } from '@studio/shared/api';
import { ComparisonIdSchema, CorrelationIdSchema } from '@studio/shared/run-format';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type InputIssue } from '../catalog';
import { InvalidComparisonInputError } from './comparisons.errors';

/** Comparison titles leave room for the " (A)" and " (B)" suffixes inside the C3 run title limit. */
export const COMPARISON_TITLE_MAX_CHARS = 196;

/**
 * `POST /comparisons` as core takes it: the C10 request plus what the api sets from the session
 * and `x-request-id`, never from a body (SPEC 0003 section 4.3).
 */
export const CreateComparisonInputSchema = z
  .object({
    request: CreateComparisonRequestSchema.refine(
      (request) => request.references === undefined || new Set(request.references).size === request.references.length,
      { path: ['references'], message: 'a reference is attached at most once' },
    ),
    /** The session owner. */
    createdBy: z.string().min(1).max(100),
    correlationId: CorrelationIdSchema.nullable().default(null),
  })
  .strict();
export type CreateComparisonInput = z.input<typeof CreateComparisonInputSchema>;

/** `POST /comparisons/:comparisonId/start` as core takes it. */
export const StartComparisonInputSchema = z
  .object({
    comparisonId: ComparisonIdSchema,
    /** Must equal the recomputed `pairWorstCaseUsd` to the cent (the owner's consent). */
    acceptedWorstCaseUsd: z.number().finite().nonnegative(),
    /** The session owner. */
    acceptedBy: z.string().min(1).max(100),
    correlationId: CorrelationIdSchema.nullable().default(null),
  })
  .strict();
export type StartComparisonInput = z.input<typeof StartComparisonInputSchema>;
export type StartComparisonFields = z.output<typeof StartComparisonInputSchema>;

/** rules/backend.md pagination (default 20, max 100); newest first, keyed by the time-ordered id. */
export const ListComparisonsCriteriaSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    /** The `nextCursor` of the previous page. */
    cursor: ComparisonIdSchema.optional(),
  })
  .strict();
export type ListComparisonsCriteria = z.input<typeof ListComparisonsCriteriaSchema>;

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path].filter((part) => part !== '').join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseComparisonInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidComparisonInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}
