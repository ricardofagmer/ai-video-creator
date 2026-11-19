import { type z } from 'zod';
import { type InputIssue } from '../catalog';
import { InvalidReviewInputError } from './review.errors';

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path].filter((part) => part !== '').join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseReviewInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidReviewInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}
