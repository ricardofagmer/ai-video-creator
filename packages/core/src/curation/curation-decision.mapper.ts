import { type CurationDecision as CurationDecisionRow } from '@prisma/client';
import { ComparisonIdSchema } from '@studio/shared/run-format';
import { CuratableKindSchema, CuratableRefSchema, CurationIdSchema, type CuratableKind, type CuratableRef, type CurationId } from '@studio/shared/curation';
import { CurationFileCorruptError } from './curation.errors';

/** A `curation_decisions` row (SPEC 0005 section 4.5), re-validated so a drifted row never leaves the module. */
export type CurationDecisionRecord = {
  curationId: CurationId;
  subjectKind: CuratableKind;
  subjectRef: CuratableRef;
  decidedBy: string;
  correlationId: string;
  decidedAt: Date;
} & (
  | { decision: 'saved'; savedRef: CuratableRef; comparisonId: string | null; ownerReason: null }
  | { decision: 'declined'; savedRef: null; comparisonId: null; ownerReason: string | null }
);

export function toCurationDecisionRecord(row: CurationDecisionRow): CurationDecisionRecord {
  const corrupt = (): CurationFileCorruptError => new CurationFileCorruptError(row.curationId, 'curation_decisions');
  const curationId = CurationIdSchema.safeParse(row.curationId);
  const subjectKind = CuratableKindSchema.safeParse(row.subjectKind);
  const subjectRef = CuratableRefSchema.safeParse(row.subjectRef);
  if (!curationId.success || !subjectKind.success || !subjectRef.success) throw corrupt();
  const common = {
    curationId: curationId.data,
    subjectKind: subjectKind.data,
    subjectRef: subjectRef.data,
    decidedBy: row.decidedBy,
    correlationId: row.correlationId,
    decidedAt: row.decidedAt,
  };
  if (row.decision === 'saved') {
    const savedRef = CuratableRefSchema.safeParse(row.savedRef);
    if (!savedRef.success || row.ownerReason !== null) throw corrupt();
    if (row.comparisonId !== null && !ComparisonIdSchema.safeParse(row.comparisonId).success) throw corrupt();
    return { ...common, decision: 'saved', savedRef: savedRef.data, comparisonId: row.comparisonId, ownerReason: null };
  }
  if (row.decision === 'declined') {
    if (row.savedRef !== null || row.comparisonId !== null) throw corrupt();
    return { ...common, decision: 'declined', savedRef: null, comparisonId: null, ownerReason: row.ownerReason };
  }
  throw corrupt();
}
