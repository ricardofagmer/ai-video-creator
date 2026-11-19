import { z } from 'zod';
import { CreateCurationRequestSchema, CurationDecisionRequestSchema } from '@studio/shared/api';
import { CuratableRefSchema, CurationIdSchema } from '@studio/shared/curation';
import { CorrelationIdSchema } from '@studio/shared/run-format';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type InputIssue } from '../catalog';
import { InvalidCurationInputError } from './curation.errors';

/** The session owner, as every owner-attributed write records it. */
const ActorSchema = z.string().min(1).max(100);

/**
 * `POST /curations` as core takes it: the C10 request plus the `x-request-id` the api sets, never
 * a body field (SPEC 0005 section 6). The correlation id is required: `curation.json` records it.
 */
export const RequestCurationInputSchema = z
  .object({
    request: CreateCurationRequestSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();
export type RequestCurationInput = z.input<typeof RequestCurationInputSchema>;

/**
 * `POST /curations/:curationId/decision` as core takes it. `decidedBy` comes from the session and
 * `correlationId` from `x-request-id`; both are inputs from the api and are never invented here.
 */
export const DecideCurationInputSchema = z
  .object({
    curationId: CurationIdSchema,
    decision: CurationDecisionRequestSchema,
    decidedBy: ActorSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();
export type DecideCurationInput = z.input<typeof DecideCurationInputSchema>;

/** rules/backend.md pagination (default 20, max 100); newest first, keyed by the time-ordered id. */
export const ListCurationsCriteriaSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    /** The `nextCursor` of the previous page. */
    cursor: CurationIdSchema.optional(),
    /** Only curations of this version ref (asset or recipe; see SPEC 0005 L7). */
    subjectRef: CuratableRefSchema.optional(),
  })
  .strict();
export type ListCurationsCriteria = z.input<typeof ListCurationsCriteriaSchema>;

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path].filter((part) => part !== '').join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseCurationInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidCurationInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}
