import { GateChangeRequestSchema, PublishRequestSchema } from '@studio/shared/api';
import { PlatformSchema, PublishAttemptIdSchema } from '@studio/shared/platforms';
import { CorrelationIdSchema, RunIdSchema } from '@studio/shared/run-format';
import { z } from 'zod';
import { type InputIssue } from '../catalog';
import { InvalidPlatformInputError } from './platforms.errors';

/*
 * Core inputs of the platform commands and queries (SPEC 0007 sections 4.4, 5.2 to 5.4). The C10
 * bodies are reused as is; `updatedBy`, `connectedBy` and `requestedBy` come from the session,
 * `correlationId` from `x-request-id` (nullable for the CLI), never from a body.
 */

const ActorSchema = z.string().min(1).max(100);
const OptionalCorrelationIdSchema = CorrelationIdSchema.nullable();
/** The session id a pending `state` is bound to (section 5.2); opaque, bounded, never logged. */
const SessionIdTextSchema = z.string().min(1).max(200);
const ApiPortSchema = z.number().int().min(1).max(65_535);

export const SetPlatformGateInputSchema = z
  .object({ platform: PlatformSchema, change: GateChangeRequestSchema, updatedBy: ActorSchema, correlationId: OptionalCorrelationIdSchema })
  .strict();
export type SetPlatformGateInput = z.input<typeof SetPlatformGateInputSchema>;

export const StartConnectionInputSchema = z
  .object({ platform: PlatformSchema, sessionId: SessionIdTextSchema, apiPort: ApiPortSchema, correlationId: OptionalCorrelationIdSchema })
  .strict();
export type StartConnectionInput = z.input<typeof StartConnectionInputSchema>;

/**
 * The callback's query after `pickConnectionCallbackQuery` and its strict schema. Values are bounded
 * here again because the CLI or a test may call the command directly.
 */
export const CompleteConnectionInputSchema = z
  .object({
    platform: PlatformSchema,
    sessionId: SessionIdTextSchema,
    apiPort: ApiPortSchema,
    code: z.string().min(1).max(2048).regex(/^[\x21-\x7E]+$/).nullable(),
    state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).nullable(),
    error: z.string().min(1).max(200).nullable(),
    connectedBy: ActorSchema,
    correlationId: OptionalCorrelationIdSchema,
  })
  .strict();
export type CompleteConnectionInput = z.input<typeof CompleteConnectionInputSchema>;
export type CompleteConnectionFields = z.output<typeof CompleteConnectionInputSchema>;

export const DisconnectInputSchema = z.object({ platform: PlatformSchema, correlationId: OptionalCorrelationIdSchema }).strict();
export type DisconnectInput = z.input<typeof DisconnectInputSchema>;

export const RequestPublishInputSchema = z
  .object({
    runId: RunIdSchema,
    platform: PlatformSchema,
    request: PublishRequestSchema,
    requestedBy: ActorSchema,
    createdBy: z.enum(['api', 'cli']),
    correlationId: OptionalCorrelationIdSchema,
  })
  .strict();
export type RequestPublishInput = z.input<typeof RequestPublishInputSchema>;
export type RequestPublishFields = z.output<typeof RequestPublishInputSchema>;

export const CancelPublishInputSchema = z
  .object({ runId: RunIdSchema, attemptId: PublishAttemptIdSchema, correlationId: OptionalCorrelationIdSchema })
  .strict();
export type CancelPublishInput = z.input<typeof CancelPublishInputSchema>;

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter((part) => part !== '').join('.'),
    message: issue.message,
  }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parsePlatformInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix = ''): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidPlatformInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}
