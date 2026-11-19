import { type z } from 'zod';
import { type InputIssue } from '../catalog';
import { InvalidLearningInputError } from './learnings.errors';

/** Paths and zod messages only; string-length messages never quote the rejected text. */
function issuesOf(error: z.ZodError): InputIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error. */
export function parseLearningInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidLearningInputError(issuesOf(parsed.error));
  return parsed.data;
}
