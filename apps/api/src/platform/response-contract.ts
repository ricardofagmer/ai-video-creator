import { type Logger } from '@nestjs/common';
import { type z } from 'zod';
import { ResponseContractViolationError } from './api.errors';

/**
 * Passes a core result through the frozen C10 schema of its route before it leaves the api. The
 * strict schemas drop nothing silently, so a field outside the contract (a token, a title, a path)
 * can never reach a client through a contract drift (SPEC 0007 K7). A mismatch is a 500 with a
 * fixed text; the log names the view and the issue paths, never a value.
 */
export function conformToContract<Schema extends z.ZodTypeAny>(options: {
  schema: Schema;
  value: unknown;
  view: string;
  logger: Logger;
  event: string;
}): z.output<Schema> {
  const parsed = options.schema.safeParse(options.value);
  if (parsed.success) return parsed.data;
  const paths = parsed.error.issues.slice(0, 20).map((issue) => issue.path.join('.').slice(0, 200));
  options.logger.error({ event: options.event, view: options.view, paths });
  throw new ResponseContractViolationError(options.view);
}
