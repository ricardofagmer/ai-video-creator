import { z } from 'zod';
import { UlidSchema } from '@studio/shared/schedules';
import { CliUsageError } from '../errors/cli.errors.js';
import { type TracesExportOptions } from './traces-export.command.js';

const MAX_PATH_LENGTH = 4096;

const TracesExportFlagsSchema = z.object({
  out: z
    .string()
    .min(1)
    .max(MAX_PATH_LENGTH)
    .refine((path) => !path.includes('\u0000')),
  force: z.boolean().default(false),
});

/**
 * Boundary validation of `traces export <id> --out <file> [--force]` (rules/security.md: allowlist,
 * bounded sizes). The id is a ULID (run and curation ids share the shape); messages name the
 * option, never echo the value or the path.
 */
export function parseTracesExportOptions(target: unknown, options: unknown): TracesExportOptions {
  const targetId = UlidSchema.safeParse(target);
  if (!targetId.success) throw new CliUsageError('Id inválido; use o id de uma execução ("studio status") ou de uma curadoria.');
  const flags = TracesExportFlagsSchema.safeParse(options);
  if (!flags.success) {
    const fields = new Set(flags.error.issues.map((issue) => String(issue.path[0] ?? '')));
    if (fields.has('out')) throw new CliUsageError('Informe em --out o arquivo de saída.');
    throw new CliUsageError('Opção inválida em --force.');
  }
  return { targetId: targetId.data, out: flags.data.out, force: flags.data.force };
}
