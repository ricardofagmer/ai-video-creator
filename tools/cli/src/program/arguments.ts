import { z } from 'zod';
import { type EmbedScope } from '@studio/core/embeddings';
import { SEMANTIC_SEARCH_DEFAULT_LIMIT } from '@studio/shared/api';
import { SEMANTIC_SEARCH_QUERY_MAX_CHARS } from '@studio/shared/catalog';
import { IsoDateSchema, PlatformSchema } from '@studio/shared/metrics';
import { RunIdSchema, type RunId } from '@studio/shared/run-format';
import { ScheduleIdSchema, type ScheduleId } from '@studio/shared/schedules';
import { CliUsageError } from '../errors/cli.errors.js';
import { cliText } from '../i18n/messages.js';
import { type UsageMessages } from '../i18n/messages/usage.js';
import { type ServiceName } from '../errors/service.errors.js';
import { type CatalogImportOptions } from '../commands/catalog-import.command.js';
import { type SemanticSearchOptions } from '../commands/catalog-search.command.js';
import { type DoctorOptions } from '../commands/doctor.command.js';
import { type InsightsOptions } from '../commands/insights.command.js';
import { type MetricsImportOptions } from '../commands/metrics-import.command.js';
import { type GateOutcome, type RunGateOptions } from '../commands/run-gate.command.js';
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

function text(): UsageMessages {
  return cliText().usage;
}

function flagsOf(issues: readonly { path: readonly PropertyKey[] }[]): string {
  return issues.map((issue) => `--${issue.path.map(String).join('.')}`).join(', ');
}

export function parseRunId(value: unknown): RunId {
  const parsed = RunIdSchema.safeParse(value);
  if (!parsed.success) throw usage(text().invalidRunId);
  return parsed.data;
}

export function parseOptionalRunId(value: unknown): RunId | undefined {
  return value === undefined ? undefined : parseRunId(value);
}

export function parseServiceName(value: unknown): ServiceName | undefined {
  if (value === undefined) return undefined;
  const parsed = ServiceNameSchema.safeParse(value);
  if (!parsed.success) throw usage(text().invalidService);
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
  throw usage(text().stopTarget);
}

export function parseSecretName(value: unknown): string {
  const parsed = z.string().min(1).max(64).safeParse(value);
  if (!parsed.success) throw usage(text().secretNameMissing);
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
  if (!parsed.success) throw usage(text().invalidOptions(flagsOf(parsed.error.issues)));
  const { recipe, brief, reference, title } = parsed.data;
  return { recipe, brief, references: reference, title };
}

/** C3 `notes` bound (approval.json decision shape). */
const MAX_GATE_NOTES = 4000;
const GateOptionsSchema = z.object({ notes: z.string().trim().min(1).max(MAX_GATE_NOTES).optional() });

/** `studio approve|reject <runId>`: notes are optional on approve and required on reject (the web asks a reason). */
export function parseGateOptions(runId: unknown, outcome: GateOutcome, options: unknown): RunGateOptions {
  const parsed = GateOptionsSchema.safeParse(options);
  if (!parsed.success) throw usage(text().notesLength(MAX_GATE_NOTES));
  const notes = parsed.data.notes ?? '';
  if (outcome === 'rejected' && notes === '') throw usage(text().rejectNotesMissing);
  return { runId: parseRunId(runId), outcome, notes };
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
  if (!parsedPath.success) throw usage(text().importPathMissing);
  const parsed = CatalogImportOptionsSchema.safeParse(options);
  if (!parsed.success) throw usage(text().invalidOptions(flagsOf(parsed.error.issues)));
  return { path: parsedPath.data, ...parsed.data };
}

export function parseSeedSourceRoot(options: unknown): string | undefined {
  const parsed = z.object({ sourceRoot: PathArgumentSchema.optional() }).safeParse(options);
  if (!parsed.success) throw usage(text().invalidOption('--source-root'));
  return parsed.data.sourceRoot;
}

export function parseDoctorOptions(options: unknown): DoctorOptions {
  const parsed = z.object({ rebuildIndex: z.boolean().default(false) }).safeParse(options);
  if (!parsed.success) throw usage(text().invalidOption('--rebuild-index'));
  return { rebuildIndex: parsed.data.rebuildIndex };
}

export function parseEmbedScope(options: unknown): EmbedScope {
  const parsed = z.object({ stale: z.boolean().default(false), all: z.boolean().default(false) }).safeParse(options);
  if (!parsed.success) throw usage(text().invalidOneOfTwo('--stale', '--all'));
  if (parsed.data.stale && parsed.data.all) throw usage(text().staleOrAll);
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
    if (fields.has('limit')) throw usage(text().searchLimit(MAX_SEARCH_LIMIT));
    throw usage(text().searchText(SEMANTIC_SEARCH_QUERY_MAX_CHARS));
  }
  return { query: parsed.data.semantic, limit: parsed.data.limit ?? SEMANTIC_SEARCH_DEFAULT_LIMIT };
}

export function parseScheduleId(value: unknown): ScheduleId {
  const parsed = ScheduleIdSchema.safeParse(value);
  if (!parsed.success) throw usage(text().invalidScheduleId);
  return parsed.data;
}

const InsightsFlagsSchema = z.object({ json: z.boolean().default(false) });

/** `insights [--json]`. */
export function parseInsightsOptions(options: unknown): InsightsOptions {
  const parsed = InsightsFlagsSchema.safeParse(options);
  if (!parsed.success) throw usage(text().invalidOption('--json'));
  return { json: parsed.data.json };
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
  if (!parsedFile.success) throw usage(text().csvFileMissing);
  const parsed = MetricsImportFlagsSchema.safeParse(options);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')));
    if (fields.has('platform')) throw usage(text().usePlatform(PlatformSchema.options.join(', ')));
    if (fields.has('asOf')) throw usage(text().asOfDate);
    throw usage(text().invalidOption('--dry-run'));
  }
  return { file: parsedFile.data, platform: parsed.data.platform, asOfDate: parsed.data.asOf, dryRun: parsed.data.dryRun };
}
