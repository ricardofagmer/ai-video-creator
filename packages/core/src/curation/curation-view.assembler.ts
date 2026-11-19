import { Injectable } from '@nestjs/common';
import { CurationViewSchema, type CurationView } from '@studio/shared/api';
import { AssetRefSchema } from '@studio/shared/catalog';
import { type CurationFile, type CurationProposal, type CurationSubject } from '@studio/shared/curation';
import { RecipeRefSchema } from '@studio/shared/recipes';
import { CurationCatalogReader } from './curation-catalog.reader';
import { type CurationDecisionRecord } from './curation-decision.mapper';
import { CurationDecisionRepository } from './curation-decision.repository';
import { queuePositionOf, type CurationQueue } from './curation-queue';
import { CurationStore } from './curation-store';
import { CurationFileCorruptError } from './curation.errors';

const TITLE_MAX_CHARS = 200;

export interface CurationViewParts {
  file: CurationFile;
  queue: CurationQueue;
  /** Read only for a `proposed` curation. */
  proposal: CurationProposal | null;
  decision: CurationDecisionRecord | null;
  title: string;
}

/** C10 `CurationView` from the files and the decision row; validated whole before it leaves core. */
export function toCurationView(parts: CurationViewParts): CurationView {
  const { file, proposal, decision } = parts;
  const candidate: CurationView = {
    curationId: file.curationId,
    status: file.status,
    subject: { ...file.subject, title: parts.title.slice(0, TITLE_MAX_CHARS) },
    ownerFocus: file.ownerFocus ?? null,
    requestedAt: file.requestedAt,
    endedAt: file.endedAt ?? null,
    queuePosition: file.status === 'requested' ? queuePositionOf(parts.queue, file.curationId) : null,
    reasonId: file.reasonId ?? null,
    failedChecks: file.failedChecks ?? [],
    noChangeReason: file.noChangeReason ?? null,
    spentUsd: file.spentUsd,
    proposal:
      file.status === 'proposed' && proposal !== null
        ? {
            diff: proposal.diff,
            diffStats: proposal.diffStats,
            changeSummary: proposal.changeSummary,
            reason: proposal.reason,
            expectedEffect: proposal.expectedEffect,
            evidenceRunIds: proposal.evidenceRunIds,
            suggestComparison: proposal.suggestComparison,
          }
        : null,
    decision:
      decision === null
        ? null
        : {
            action: decision.decision,
            savedRef: decision.savedRef,
            comparisonId: decision.comparisonId,
            ownerReason: decision.ownerReason,
            decidedAt: decision.decidedAt.toISOString(),
          },
  };
  const parsed = CurationViewSchema.safeParse(candidate);
  if (!parsed.success) throw new CurationFileCorruptError(file.curationId, 'curation.json');
  return parsed.data;
}

/**
 * Builds views for the api handlers: the subject title from the catalog (the ref when the version
 * is gone), the proposal for a `proposed` curation, and the decision row.
 */
@Injectable()
export class CurationViewAssembler {
  constructor(
    private readonly catalog: CurationCatalogReader,
    private readonly store: CurationStore,
    private readonly decisions: CurationDecisionRepository,
  ) {}

  /** `decision` is passed when the caller already read it (a page reads them in one query). */
  async viewOf(file: CurationFile, queue: CurationQueue, decision?: CurationDecisionRecord | null): Promise<CurationView> {
    const proposal = file.status === 'proposed' ? await this.store.readProposal(file.curationId) : null;
    return toCurationView({
      file,
      queue,
      proposal,
      decision: decision === undefined ? await this.decisions.findByCurationId(file.curationId) : decision,
      title: await this.titleOf(file.subject),
    });
  }

  async titleOf(subject: CurationSubject): Promise<string> {
    if (subject.kind === 'recipe') {
      const ref = RecipeRefSchema.safeParse(subject.ref);
      const view = ref.success ? await this.catalog.findRecipeVersion(ref.data) : null;
      return view?.recipe.name ?? subject.ref;
    }
    const ref = AssetRefSchema.safeParse(subject.ref);
    const found = ref.success ? await this.catalog.findAssetVersion(ref.data) : null;
    return found?.version.name ?? subject.ref;
  }
}
