import { type Prisma } from '@prisma/client';
import { LearningNoteSchema, formatAssetRef, type LearningNote } from '@studio/shared/catalog';
import { LearningNoteCorruptError } from './learnings.errors';

/** Every note read carries its version's id and number, so the C1 `ref` is built from the row. */
export const learningNoteProjection = {
  include: { assetVersion: { select: { assetId: true, version: true } } },
} as const satisfies { include: Prisma.AssetLearningNoteInclude };
export type LearningNoteRow = Prisma.AssetLearningNoteGetPayload<typeof learningNoteProjection>;

/** Row to C1 `LearningNote` (`LearningNoteView` is the same schema); re-validated whole. */
export function toLearningNote(row: LearningNoteRow): LearningNote {
  const candidate: Record<string, unknown> = {
    noteId: row.id,
    ref: formatAssetRef({ assetId: row.assetVersion.assetId, version: row.assetVersion.version }),
    text: row.text,
    sourceRunId: row.sourceRunId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    retiredAt: row.retiredAt === null ? null : row.retiredAt.toISOString(),
  };
  const parsed = LearningNoteSchema.safeParse(candidate);
  if (!parsed.success) throw new LearningNoteCorruptError(row.id);
  return parsed.data;
}
