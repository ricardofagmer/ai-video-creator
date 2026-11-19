import { z } from 'zod';
import { type EmbedScope } from '@studio/core/embeddings';
import { SEMANTIC_SEARCH_DEFAULT_LIMIT } from '@studio/shared/api';
import { SEMANTIC_SEARCH_QUERY_MAX_CHARS } from '@studio/shared/catalog';
import { IsoDateSchema, PlatformSchema } from '@studio/shared/metrics';
import { RunIdSchema, type RunId } from '@studio/shared/run-format';
import { ScheduleIdSchema, type ScheduleId } from '@studio/shared/schedules';
import { CliUsageError } from '../errors/cli.errors.js';
import { type ServiceName } from '../errors/service.errors.js';
import { type CatalogImportOptions } from '../commands/catalog-import.command.js';
import { type SemanticSearchOptions } from '../commands/catalog-search.command.js';
import { type DoctorOptions } from '../commands/doctor.command.js';
import { type MetricsImportOptions } from '../commands/metrics-import.command.js';
import { type RunCommandOptions } from '../commands/run.command.js';

/**
 * Boundary validation of everything commander hands to an action (rules/security.md: allowlist,
 * bounded sizes). Commander types action arguments loosely, so each arrives as `unknown` and is
 * parsed here before a command sees it. Messages name the option, never echo the value.
 */
const MAX_PATH_LENGTH = 4096;
const MAX_REFERENCES = 50;

const PathArgumentSchema = z.string().min(1).max(MAX_PATH_LENGTH);
const ShortTextSchema = z.string().min(1).max(200);

const ServiceNameSchema = z.enum(['api', 'web']);

function usage(message: string): CliUsageError {
  return new CliUsageError(message);
}

export function parseRunId(value: unknown): RunId {
  const parsed = RunIdSchema.safeParse(value);
  if (!parsed.success) throw usage('Id de execução inválido; use o id mostrado por "studio status".');
  return parsed.data;
}

export function parseOptionalRunId(value: unknown): RunId | undefined {
  return value === undefined ? undefined : parseRunId(value);
}

export function parseServiceName(value: unknown): ServiceName | undefined {
  if (value === undefined) return undefined;
  const parsed = ServiceNameSchema.safeParse(value);
  if (!parsed.success) throw usage('Serviço inválido; use "web" ou "api".');
  return parsed.data;
}

/** `studio stop` takes a service name or a run id; ULIDs never spell `web` or `api`, so no clash. */
export type StopTarget = { kind: 'services'; service: ServiceName | undefined } | { kind: 'run'; runId: RunId };

export function parseStopTarget(value: unknown): StopTarget {
  if (value === undefined) return { kind: 'services', service: undefined };
  const service = ServiceNameSchema.safeParse(value);
  if (service.success) return { kind: 'services', service: service.data };
  const runId = RunIdSchema.safeParse(value);
  if (runId.success) return { kind: 'run', runId: runId.data };
  throw usage('Use "studio stop" (web e api), "studio stop web", "studio stop api" ou "studio stop <id da execução>".');
}

export function parseSecretName(value: unknown): string {
  const parsed = z.string().min(1).max(64).safeParse(value);
  if (!parsed.success) throw usage('Informe o nome da chave.');
  return parsed.data;
}

const RunOptionsSchema = z.object({
  recipe: ShortTextSchema,
  brief: PathArgumentSchema,
  reference: z.array(ShortTextSchema).max(MAX_REFERENCES).default([]),
  title: ShortTextSchema.optional(),
});

export function parseRunOptions(value: unknown): RunCommandOptions {
  const parsed = RunOptionsSchema.safeParse(value);
  if (!parsed.success) throw usage(`Opções inválidas em ${parsed.error.issues.map((issue) => `--${issue.path.join('.')}`).join(', ')}.`);
  const { recipe, brief, reference, title } = parsed.data;
  return { recipe, brief, references: reference, title };
}

const CatalogImportOptionsSchema = z.object({
  kind: ShortTextSchema,
  id: ShortTextSchema,
  metadata: PathArgumentSchema,
  sensitivity: ShortTextSchema.optional(),
  byReference: z.boolean().default(false),
  mime: ShortTextSchema.optional(),
});

export function parseCatalogImportOptions(path: unknown, options: unknown): CatalogImportOptions {
  const parsedPath = PathArgumentSchema.safeParse(path);
  if (!parsedPath.success) throw usage('Informe o caminho do arquivo ou pasta a importar.');
  const parsed = CatalogImportOptionsSchema.safeParse(options);
  if (!parsed.success) throw usage(`Opções inválidas em ${parsed.error.issues.map((issue) => `--${issue.path.join('.')}`).join(', ')}.`);
  return { path: parsedPath.data, ...parsed.data };
}

export function parseSeedSourceRoot(options: unknown): string | undefined {
  const parsed = z.object({ sourceRoot: PathArgumentSchema.optional() }).safeParse(options);
  if (!parsed.success) throw usage('Opção inválida em --source-root.');
  return parsed.data.sourceRoot;
}

export function parseDoctorOptions(options: unknown): DoctorOptions {
  const parsed = z.object({ rebuildIndex: z.boolean().default(false) }).safeParse(options);
  if (!parsed.success) throw usage('Opção inválida em --rebuild-index.');
  return { rebuildIndex: parsed.data.rebuildIndex };
}

export function parseEmbedScope(options: unknown): EmbedScope {
  const parsed = z.object({ stale: z.boolean().default(false), all: z.boolean().default(false) }).safeParse(options);
  if (!parsed.success) throw usage('Opção inválida em --stale ou --all.');
  if (parsed.data.stale && parsed.data.all) throw usage('Use --stale ou --all, não os dois.');
  if (parsed.data.all) return 'all';
  return parsed.data.stale ? 'stale' : 'unindexed';
}

/** SemanticSearchRequestSchema allows 1..20; a shell argument longer than this is refused unread. */
const MAX_SEARCH_LIMIT = 20;
const MAX_RAW_QUERY_LENGTH = 4 * SEMANTIC_SEARCH_QUERY_MAX_CHARS;

const SemanticSearchOptionsSchema = z.object({
  semantic: z
    .string()
    .max(MAX_RAW_QUERY_LENGTH)
    .transform((text) => text.normalize('NFC').trim())
    .pipe(z.string().min(1).max(SEMANTIC_SEARCH_QUERY_MAX_CHARS)),
  limit: z
    .string()
    .regex(/^[0-9]{1,2}$/)
    .transform((text) => Number.parseInt(text, 10))
    .pipe(z.number().int().min(1).max(MAX_SEARCH_LIMIT))
    .optional(),
});

/**
 * `catalog search --semantic <text> [--limit <n>]`: the same normalization and length rule as the
 * api (NFC, trim, 1..500; section 5.2 step 1), re-checked by the core handler. Messages name the
 * option and the bounds; the query text is never echoed.
 */
export function parseSemanticSearchOptions(options: unknown): SemanticSearchOptions {
  const parsed = SemanticSearchOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')));
    if (fields.has('limit')) throw usage(`Use --limit entre 1 e ${MAX_SEARCH_LIMIT}.`);
    throw usage(`Informe em --semantic um texto de 1 a ${SEMANTIC_SEARCH_QUERY_MAX_CHARS} caracteres.`);
  }
  return { query: parsed.data.semantic, limit: parsed.data.limit ?? SEMANTIC_SEARCH_DEFAULT_LIMIT };
}

export function parseScheduleId(value: unknown): ScheduleId {
  const parsed = ScheduleIdSchema.safeParse(value);
  if (!parsed.success) throw usage('Id de agendamento inválido; use o id mostrado por "studio schedules list".');
  return parsed.data;
}

const MetricsImportFlagsSchema = z.object({
  platform: PlatformSchema,
  asOf: IsoDateSchema,
  dryRun: z.boolean().default(false),
});

/**
 * `metrics import <file> --platform <p> --as-of <yyyy-mm-dd> [--dry-run]`. The platform is the
 * allowlist of `PlatformSchema`; the date is checked again (not in the future) by the core handler.
 * Messages name the option, never echo the value or the path.
 */
export function parseMetricsImportOptions(file: unknown, options: unknown): MetricsImportOptions {
  const parsedFile = PathArgumentSchema.safeParse(file);
  if (!parsedFile.success) throw usage('Informe o arquivo CSV exportado pela plataforma.');
  const parsed = MetricsImportFlagsSchema.safeParse(options);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')));
    if (fields.has('platform')) throw usage(`Use --platform ${PlatformSchema.options.join(', ')}.`);
    if (fields.has('asOf')) throw usage('Use --as-of com a data dos números, no formato AAAA-MM-DD.');
    throw usage('Opção inválida em --dry-run.');
  }
  return { file: parsedFile.data, platform: parsed.data.platform, asOfDate: parsed.data.asOf, dryRun: parsed.data.dryRun };
}
