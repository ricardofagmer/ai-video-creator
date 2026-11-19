import { type RunIndexEntry as RunIndexRow } from '@prisma/client';
import { z } from 'zod';
import { RecipePinSchema, type RecipePin } from '@studio/shared/recipes';
import {
  IsoDateTimeSchema,
  RunCreatedBySchema,
  RunIdSchema,
  RunStatusSchema,
  TotalsSchema,
  type IsoDateTime,
  type RunFile,
  type RunId,
  type RunStatus,
  type Totals,
} from '@studio/shared/run-format';
import { RunIndexRowCorruptError } from './runs.errors';

/**
 * Column values of one `run_index_entries` row, mirrored whole from run.json. A plain shape (no
 * relation fields) so the same value serves as the upsert's create and update data.
 */
export interface RunIndexData {
  id: string;
  title: string;
  status: string;
  statusSince: Date;
  createdBy: string;
  recipeId: string;
  recipeVersion: number;
  recipeContentHash: string;
  costUsd: number;
  durationMs: bigint;
  totalsJson: string;
  createdAt: Date;
  updatedAt: Date;
  indexedAt: Date;
  /** SPEC 0003 section 4.4: the A/B comparison this run is an arm of; null on ordinary runs. */
  comparisonId: string | null;
  comparisonArm: 'a' | 'b' | null;
}

/**
 * An index entry as callers see it; `status` is the recorded one (see C3 `displayedRunStatus`).
 * The comparison columns stay inside core: the C10 run views carry no comparison field.
 */
export interface RunIndexEntry {
  runId: RunId;
  title: string;
  status: RunStatus;
  statusSince: IsoDateTime;
  createdBy: RunFile['createdBy'];
  recipe: RecipePin;
  costUsd: number;
  durationMs: number;
  totals: Totals;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  indexedAt: IsoDateTime;
}

const RunIndexEntrySchema = z
  .object({
    runId: RunIdSchema,
    title: z.string().min(1).max(200),
    status: RunStatusSchema,
    statusSince: IsoDateTimeSchema,
    createdBy: RunCreatedBySchema,
    recipe: RecipePinSchema,
    costUsd: z.number().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    totals: TotalsSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    indexedAt: IsoDateTimeSchema,
  })
  .strict();

/** Files win (ADR 0003): every column is overwritten from run.json, nothing is merged. */
export function toRunIndexData(run: RunFile, indexedAt: Date): RunIndexData {
  return {
    id: run.runId,
    title: run.title,
    status: run.state.status,
    statusSince: new Date(run.state.since),
    createdBy: run.createdBy,
    recipeId: run.recipe.definition.id,
    recipeVersion: run.recipe.definition.version,
    recipeContentHash: run.recipe.contentHash,
    costUsd: run.totals.costUsd,
    durationMs: BigInt(run.totals.durationMs),
    totalsJson: JSON.stringify(run.totals),
    createdAt: new Date(run.createdAt),
    updatedAt: new Date(run.updatedAt),
    indexedAt,
    comparisonId: run.comparison?.comparisonId ?? null,
    comparisonArm: run.comparison?.arm ?? null,
  };
}

function parseTotals(text: string, runId: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new RunIndexRowCorruptError(runId, { cause: error });
  }
}

/** Row to entry, re-validated against C3 so a bad row never leaves the module. */
export function toRunIndexEntry(row: RunIndexRow): RunIndexEntry {
  const durationMs = Number(row.durationMs);
  const candidate: Record<string, unknown> = {
    runId: row.id,
    title: row.title,
    status: row.status,
    statusSince: row.statusSince.toISOString(),
    createdBy: row.createdBy,
    recipe: { ref: `${row.recipeId}@${row.recipeVersion}`, contentHash: row.recipeContentHash },
    costUsd: row.costUsd,
    durationMs: Number.isSafeInteger(durationMs) ? durationMs : -1,
    totals: parseTotals(row.totalsJson, row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    indexedAt: row.indexedAt.toISOString(),
  };
  const parsed = RunIndexEntrySchema.safeParse(candidate);
  if (!parsed.success) throw new RunIndexRowCorruptError(row.id);
  return parsed.data;
}
