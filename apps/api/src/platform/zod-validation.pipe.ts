import { type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';
import { RequestValidationError } from './api.errors';

/** Request bodies are bounded by the JSON parser; issue lists are bounded here. */
const MAX_REPORTED_ISSUES = 50;

/**
 * Boundary validation with the C10 zod schemas (ADR 0001: thin controllers validate with zod).
 * Issues are reported as path + zod code only: zod messages can quote the rejected value, and a
 * rejected value may be a passphrase.
 */
export class ZodValidationPipe<Schema extends z.ZodTypeAny> implements PipeTransform<unknown, z.output<Schema>> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new RequestValidationError(
        parsed.error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({ path: issue.path.join('.').slice(0, 200), code: issue.code })),
      );
    }
    return parsed.data;
  }
}
