import { Injectable, Logger } from '@nestjs/common';
import { UNTRUSTED_TAG, wrapDelimited } from '@studio/shared/agents';
import { QUALITY_SCORE_FORMULA_VERSION, type Sha256 } from '@studio/shared/catalog';
import { curationBounds, type CurationFile } from '@studio/shared/curation';
import { LearningNotesReader } from '../learnings/learning-notes.reader';
import { CurationCatalogReader } from './curation-catalog.reader';
import { CurationDecisionRepository } from './curation-decision.repository';
import { toPacketRun } from './curation-evidence.mapper';
import { CurationEvidenceRepository } from './curation-evidence.repository';
import { CurationStore } from './curation-store';
import { CurationSubjectSelector, type SelectedSubject } from './curation-subject.selector';
import { type CuratorPacketInputs } from './curator-packet';

/** Sizes of what was collected, for the `curation.collected` event (no text, SPEC 0005 K7). */
export interface CollectedCounts {
  runs: number;
  notes: number;
  evidence: number;
  declined: number;
}

export type CollectedEvidence =
  | {
      status: 'collected';
      /** Byte-identical on both calls (L3). */
      inputs: CuratorPacketInputs;
      /** The selected subject, with the undelimited body the ground check diffs against. */
      selected: SelectedSubject;
      baseBodySha256: Sha256;
      counts: CollectedCounts;
    }
  | { status: 'refused'; reason: 'subject-refused' | 'evidence-unavailable' };

/** Cuts to `max` UTF-16 units without splitting a surrogate pair. */
export function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  const lastKept = text.charCodeAt(max - 1);
  const splitsPair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, splitsPair ? max - 1 : max);
}

function untrusted(text: string, attributes: Readonly<Record<string, string>> = {}): string {
  return wrapDelimited(UNTRUSTED_TAG, text, attributes);
}

/**
 * The evidence collector (SPEC 0005 section 5.3), read-only: SQLite through Prisma reads and the
 * `curations/` files of declined proposals. Every free text (body, notes, review excerpts, focus,
 * declined reasons) is its own `<untrusted>` block with embedded tags escaped (C5-AC-14). A subject
 * that no longer passes the selector is `subject-refused`; any read failure is
 * `evidence-unavailable`, logged by error name only.
 */
@Injectable()
export class CurationEvidenceCollector {
  private readonly logger = new Logger(CurationEvidenceCollector.name);

  constructor(
    private readonly selector: CurationSubjectSelector,
    private readonly evidence: CurationEvidenceRepository,
    private readonly catalog: CurationCatalogReader,
    private readonly learnings: LearningNotesReader,
    private readonly decisions: CurationDecisionRepository,
    private readonly store: CurationStore,
  ) {}

  async collect(file: CurationFile): Promise<CollectedEvidence> {
    try {
      const selection = await this.selector.select(file.subject);
      if (selection.status === 'refused') return { status: 'refused', reason: 'subject-refused' };
      return await this.collectFor(file, selection.selected);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'unknown';
      this.logger.warn({ event: 'curation.collect-failed', curationId: file.curationId, errorName });
      return { status: 'refused', reason: 'evidence-unavailable' };
    }
  }

  private async collectFor(file: CurationFile, selected: SelectedSubject): Promise<CollectedEvidence> {
    const { subject, target } = selected;
    const runs = (await this.evidence.listReviewedRuns(selected.evidenceKey, curationBounds.maxRuns)).map(toPacketRun);
    const reviewNotes = await this.evidence.listReviewNotes(selected.evidenceKey, curationBounds.maxEvidence);
    const notes = target.kind === 'asset' ? await this.activeNotes(subject.ref) : [];
    const declinedProposals = await this.declinedProposals(file);

    const inputs: CuratorPacketInputs = {
      subject: {
        ref: subject.ref,
        kind: subject.kind,
        title: selected.title,
        status: selected.status,
        body: untrusted(selected.body, { ref: subject.ref }),
      },
      outcomes: {
        // B8: a recipe version carries no quality columns; its sample is the reviewed-run count.
        qualityScore: target.kind === 'asset' ? target.version.qualityScore : null,
        sampleSize: target.kind === 'asset' ? target.version.qualitySampleSize : selected.reviewedRunCount,
        formulaVersion: String(QUALITY_SCORE_FORMULA_VERSION),
        baselineScore: target.kind === 'asset' && selected.status === 'draft' ? await this.catalog.promotedVersionScore(target.version.id) : null,
        runs,
      },
      notes,
      evidence: reviewNotes
        .filter((row) => row.notes.trim() !== '')
        .map((row) => ({ runId: row.runId, reviewExcerpt: untrusted(cutText(row.notes, curationBounds.excerptChars), { run: row.runId }) })),
      ...(file.ownerFocus === undefined ? {} : { ownerFocus: untrusted(cutText(file.ownerFocus, curationBounds.focusChars)) }),
      declinedProposals,
    };
    return {
      status: 'collected',
      inputs,
      selected,
      baseBodySha256: selected.bodySha256,
      counts: { runs: runs.length, notes: notes.length, evidence: inputs.evidence.length, declined: declinedProposals.length },
    };
  }

  /** Active notes only, max 10 (biometric subjects never reach this: the selector refused them). */
  private async activeNotes(ref: string): Promise<CuratorPacketInputs['notes']> {
    const notes = await this.learnings.notesOfVersion(ref);
    return notes
      .filter((note) => note.status === 'active')
      .slice(0, curationBounds.maxNotes)
      .map((note) => ({ noteId: note.noteId, text: untrusted(note.text, { note: note.noteId }) }));
  }

  /** A declined proposal whose `proposal.json` is missing or invalid is dropped (section 5.3). */
  private async declinedProposals(file: CurationFile): Promise<CuratorPacketInputs['declinedProposals']> {
    const rows = await this.decisions.latestDeclined(file.subject.kind, file.subject.ref, curationBounds.maxDeclined);
    const declined: CuratorPacketInputs['declinedProposals'] = [];
    for (const row of rows) {
      let changeSummary: string;
      try {
        const proposal = await this.store.readProposal(row.curationId);
        if (proposal === null) continue;
        changeSummary = proposal.changeSummary;
      } catch (error) {
        this.logger.warn({ event: 'curation.declined-proposal-skipped', curationId: row.curationId, errorName: error instanceof Error ? error.name : 'unknown' });
        continue;
      }
      declined.push({
        curationId: row.curationId,
        changeSummary,
        ...(row.ownerReason === null ? {} : { ownerReason: untrusted(cutText(row.ownerReason, curationBounds.declineReasonChars)) }),
      });
    }
    return declined;
  }
}
