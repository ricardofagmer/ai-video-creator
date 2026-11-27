import { type BadgeTone } from '@studio/ui';
import { type CurationView } from '@studio/shared/api';
import { type WebMessages } from '@/messages';
import {
  type CuratableKind,
  type CurationCheckId,
  type CurationReasonId,
  type CurationStatus,
  type CurationSubject,
} from '@studio/shared/curation';

type CurationTexts = WebMessages['curations'];

export const curationStatusTones: Readonly<Record<CurationStatus, BadgeTone>> = {
  requested: 'neutral',
  collecting: 'info',
  proposed: 'success',
  'no-change': 'neutral',
  'no-proposal': 'warning',
  failed: 'danger',
  refused: 'warning',
};

function isCheckId(reasonId: CurationReasonId, t: CurationTexts): reasonId is CurationCheckId {
  return reasonId in t.checks;
}

/** Every reason id of `curation.json` (refused, failed or a check id) as a phrase. */
function reasonText(reasonId: CurationReasonId | null, t: CurationTexts): string {
  if (reasonId === null) return t.unknownReason;
  return isCheckId(reasonId, t) ? t.checks[reasonId] : t.reasons[reasonId];
}

/** The failed checks of a `no-proposal`, else its reason id. */
function failedChecksText(curation: CurationView, t: CurationTexts): string {
  if (curation.failedChecks.length > 0) return curation.failedChecks.map((check) => t.checks[check]).join('; ');
  return reasonText(curation.reasonId, t);
}

/** The template adds its own final period; a model-written reason often ends with one. */
function withoutFinalPeriod(text: string): string {
  return text.trim().replace(/\.+$/, '');
}

/**
 * The owner texts of topology 0004 section 9 for the four outcomes without a proposal, with the
 * reason id mapped to a phrase. `noChangeReason` is model-written and stays plain text.
 * Null for every other status.
 */
export function curationOutcomeText(curation: CurationView, t: CurationTexts): string | null {
  switch (curation.status) {
    case 'failed':
      return t.outcomes.failed(reasonText(curation.reasonId, t));
    case 'no-proposal':
      return t.outcomes.noProposal(failedChecksText(curation, t));
    case 'no-change':
      return t.outcomes.noChange(withoutFinalPeriod(curation.noChangeReason ?? t.unknownReason));
    case 'refused':
      return t.outcomes.refused(reasonText(curation.reasonId, t));
    default:
      return null;
  }
}

/** "Na fila (posição N)" while requested; the status label otherwise. */
export function curationProgressText(curation: CurationView, t: CurationTexts): string {
  if (curation.status === 'requested') {
    return curation.queuePosition === null ? t.progress.queued : t.progress.queuedAt(curation.queuePosition);
  }
  if (curation.status === 'collecting') return t.progress.working;
  return t.statuses[curation.status];
}

/** One short line for the owner's decision on a proposal, or null before any. */
export function curationDecisionText(decision: CurationView['decision'], t: CurationTexts): string | null {
  if (decision === null) return null;
  if (decision.action === 'declined') return t.decisionShort.declined;
  return decision.comparisonId === null ? t.decisionShort.saved : t.decisionShort.savedCompared;
}

/** `<id>@<version>` split; asset and recipe refs share the shape (SPEC 0005 L7). Null when malformed. */
function splitVersionedRef(ref: string): { id: string; version: number } | null {
  const separator = ref.lastIndexOf('@');
  const versionText = ref.slice(separator + 1);
  if (separator <= 0 || !/^[1-9][0-9]{0,8}$/.test(versionText)) return null;
  return { id: ref.slice(0, separator), version: Number.parseInt(versionText, 10) };
}

/** The version page of a curated ref; `kind` decides catalog or recipes, since the ref cannot. */
export function curatedVersionHref(kind: CuratableKind, ref: string): string | null {
  const parsed = splitVersionedRef(ref);
  if (parsed === null) return null;
  const base = kind === 'recipe' ? '/receitas' : '/catalogo';
  return `${base}/${encodeURIComponent(parsed.id)}?versao=${parsed.version}`;
}

/** The asset id of a prompt or skill subject; null for a recipe subject or a malformed ref. */
export function subjectAssetId(subject: CurationSubject): string | null {
  if (subject.kind === 'recipe') return null;
  return splitVersionedRef(subject.ref)?.id ?? null;
}

export function curationHref(curationId: string): string {
  return `/curadorias/${encodeURIComponent(curationId)}`;
}
