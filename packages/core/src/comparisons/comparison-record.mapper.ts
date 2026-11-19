import { type Comparison as ComparisonRow } from '@prisma/client';
import { z } from 'zod';
import { ComparisonIdSchema, IsoDateTimeSchema, RunIdSchema, type ComparisonId, type IsoDateTime, type RunId } from '@studio/shared/run-format';
import { ComparisonRowCorruptError } from './comparisons.errors';

/**
 * A `comparisons` row as the module reads it: the index that finds the two arms. Subject, brief
 * hash and consent are read from the run.json links, which win (SPEC 0003 section 5.3).
 */
export interface ComparisonRecord {
  comparisonId: ComparisonId;
  title: string;
  createdBy: string;
  createdAt: IsoDateTime;
  runAId: RunId;
  runBId: RunId;
}

const ComparisonRecordSchema = z
  .object({
    comparisonId: ComparisonIdSchema,
    title: z.string().min(1).max(200),
    createdBy: z.string().min(1).max(100),
    createdAt: IsoDateTimeSchema,
    runAId: RunIdSchema,
    runBId: RunIdSchema,
  })
  .strict();

/** Row to record, re-validated so a bad row never leaves the module. */
export function toComparisonRecord(row: ComparisonRow): ComparisonRecord {
  const parsed = ComparisonRecordSchema.safeParse({
    comparisonId: row.id,
    title: row.title,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    runAId: row.runAId,
    runBId: row.runBId,
  });
  if (!parsed.success) throw new ComparisonRowCorruptError(row.id);
  return parsed.data;
}

export interface NewComparisonRow {
  id: ComparisonId;
  title: string;
  createdBy: string;
  createdAt: Date;
  subjectJson: string;
  briefHash: string;
  runAId: RunId;
  runBId: RunId;
}
