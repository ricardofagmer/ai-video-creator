import { Injectable } from '@nestjs/common';
import { type CuratableKind, type CuratableRef, type CurationId } from '@studio/shared/curation';
import { PrismaService } from '../prisma';
import { toCurationDecisionRecord, type CurationDecisionRecord } from './curation-decision.mapper';

/** The owner's decision on a proposal; `decidedBy` and `correlationId` come from the api request. */
export type NewCurationDecision = {
  curationId: CurationId;
  subjectKind: CuratableKind;
  subjectRef: CuratableRef;
  decidedBy: string;
  correlationId: string;
  decidedAt: Date;
} & ({ decision: 'saved'; savedRef: CuratableRef } | { decision: 'declined'; ownerReason: string | null });

/**
 * Data access for `curation_decisions` (SPEC 0005 section 4.5), the only SQLite table of the
 * curation module. Writes are one insert per curation and a one-time `comparison_id` link; there
 * is no delete. The api is the only writer (ADR 0003); the watcher reads declined rows.
 */
@Injectable()
export class CurationDecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCurationId(curationId: CurationId): Promise<CurationDecisionRecord | null> {
    const row = await this.prisma.curationDecision.findUnique({ where: { curationId } });
    return row === null ? null : toCurationDecisionRecord(row);
  }

  /** Decisions of one page of curations, keyed by curation id. */
  async findByCurationIds(curationIds: readonly CurationId[]): Promise<Map<CurationId, CurationDecisionRecord>> {
    const decisions = new Map<CurationId, CurationDecisionRecord>();
    if (curationIds.length === 0) return decisions;
    const rows = await this.prisma.curationDecision.findMany({ where: { curationId: { in: [...curationIds] } } });
    for (const row of rows) decisions.set(row.curationId, toCurationDecisionRecord(row));
    return decisions;
  }

  /** `declinedProposals`: the subject's newest declined rows (max 3, topology 0004 section 6). */
  async latestDeclined(subjectKind: CuratableKind, subjectRef: CuratableRef, limit: number): Promise<CurationDecisionRecord[]> {
    const rows = await this.prisma.curationDecision.findMany({
      where: { subjectKind, subjectRef, decision: 'declined' },
      orderBy: [{ decidedAt: 'desc' }, { curationId: 'desc' }],
      take: limit,
    });
    return rows.map(toCurationDecisionRecord);
  }

  /** The primary key refuses a second decision for the same curation. */
  async insert(decision: NewCurationDecision): Promise<CurationDecisionRecord> {
    const row = await this.prisma.curationDecision.create({
      data: {
        curationId: decision.curationId,
        subjectKind: decision.subjectKind,
        subjectRef: decision.subjectRef,
        decision: decision.decision,
        ownerReason: decision.decision === 'declined' ? decision.ownerReason : null,
        savedRef: decision.decision === 'saved' ? decision.savedRef : null,
        comparisonId: null,
        decidedBy: decision.decidedBy,
        correlationId: decision.correlationId,
        decidedAt: decision.decidedAt,
      },
    });
    return toCurationDecisionRecord(row);
  }

  /** Links the comparison once: only a `saved` row whose `comparison_id` is still null changes. */
  async linkComparison(curationId: CurationId, comparisonId: string): Promise<boolean> {
    const result = await this.prisma.curationDecision.updateMany({
      where: { curationId, decision: 'saved', comparisonId: null },
      data: { comparisonId },
    });
    return result.count === 1;
  }
}
