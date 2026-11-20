import { z } from 'zod';
import { InputError } from '../errors';

function coerceNumeric(value: unknown): unknown {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
}

/**
 * CLI options arrive as strings and programmatic callers pass numbers; both meet the same range
 * check, so no unvalidated number ever reaches a filter expression or argv.
 */
export function numberArg(schema: z.ZodNumber): z.ZodPreprocess<z.ZodNumber, unknown> {
  return z.preprocess(coerceNumeric, schema);
}

export const filePathArg = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes('\0'), 'path contains a NUL byte');

/** Boundary validation for every C9 command; failures are input errors (exit 1, nothing written). */
export function parseCommandArgs<T extends z.ZodTypeAny>(schema: T, raw: unknown, command: string): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`);
    throw new InputError(`invalid ${command} arguments: ${issues.join('; ')}`, `run ace ${command} --help`);
  }
  return parsed.data;
}
