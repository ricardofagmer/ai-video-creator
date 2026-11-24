import { type BadgeTone, type Locale } from '@studio/ui';
import { type ComparisonArmView, type ComparisonView } from '@studio/shared/api';
import { type ComparisonSubject, type RunStatus } from '@studio/shared/run-format';
import { formatDecimal } from '@/lib/i18n/format';
import { type WebMessages } from '@/messages';

type ComparisonStatus = ComparisonView['status'];
type ComparisonTexts = WebMessages['curations']['comparisons'];
type SlotLabels = WebMessages['recipes']['bindings']['slots'];

export const comparisonStatusTones: Readonly<Record<ComparisonStatus, BadgeTone>> = {
  draft: 'neutral',
  running: 'info',
  ready: 'success',
  incomplete: 'warning',
};

/** Statuses after which a run has rendered its final video (`rejected` only with a manifest). */
export const finishedRunStatuses: readonly RunStatus[] = ['review', 'approved', 'rejected'];

function isKnownSlot(slot: string, labels: SlotLabels): slot is keyof SlotLabels {
  return slot in labels;
}

/** The label of a recipe binding slot, or the slot itself when the editor does not know it. */
export function slotLabel(slot: string, labels: SlotLabels): string {
  return isKnownSlot(slot, labels) ? labels[slot] : slot;
}

/** One line naming what the comparison compares. */
export function subjectText(subject: ComparisonSubject, t: WebMessages): string {
  const texts = t.curations.comparisons.subject;
  if (subject.kind === 'asset-binding') return texts.binding(slotLabel(subject.slot, t.recipes.bindings.slots), subject.a, subject.b);
  return texts.recipe(subject.a, subject.b);
}

/** `<id>@<version>` split; asset and recipe refs share the shape (SPEC 0002 A10). Null when malformed. */
function splitVersionedRef(ref: string): { id: string; version: number } | null {
  const separator = ref.lastIndexOf('@');
  const versionText = ref.slice(separator + 1);
  if (separator <= 0 || !/^[1-9][0-9]{0,8}$/.test(versionText)) return null;
  return { id: ref.slice(0, separator), version: Number.parseInt(versionText, 10) };
}

/**
 * The page of the version an arm ran, carrying `?comparacao=` so its promotion dialog can offer
 * this comparison as evidence. The comparison page itself never changes a version's status.
 */
export function comparedVersionHref(subject: ComparisonSubject, comparedRef: string, comparisonId: string): string | null {
  const parsed = splitVersionedRef(comparedRef);
  if (parsed === null) return null;
  const base = subject.kind === 'asset-binding' ? '/catalogo' : '/receitas';
  const query = new URLSearchParams({ versao: String(parsed.version), comparacao: comparisonId });
  return `${base}/${encodeURIComponent(parsed.id)}?${query.toString()}`;
}

/** The recipe ref an arm ran, as id and version, for reading its format. */
export function recipeIdOf(ref: string): { recipeId: string; version: number } | null {
  const parsed = splitVersionedRef(ref);
  return parsed === null ? null : { recipeId: parsed.id, version: parsed.version };
}

export function qaText(qa: ComparisonArmView['qa'], t: ComparisonTexts): string {
  if (qa === null) return t.qa.none;
  if (qa.outcome === 'passed') return t.qa.passed;
  return t.qa.passedWithWarnings(qa.warnings);
}

export function decisionText(decision: ComparisonArmView['decision'], t: ComparisonTexts): string {
  if (decision === null) return t.decision.none;
  return decision.outcome === 'approved' ? t.decision.approved(decision.rating) : t.decision.rejected(decision.rating);
}

export function reviewerScoresText(scores: ComparisonArmView['reviewerScores'], t: WebMessages, locale: Locale): string {
  if (scores.length === 0) return t.curations.comparisons.reviewerScoresNone;
  return scores.map((score) => `${t.runs.review.subjects[score.subject]} ${formatDecimal(score.overall, locale, 1, true)}`).join(' · ');
}

/** The `verified` flags that failed, as sentences for the warning on the comparison page. */
export function verificationWarnings(verified: ComparisonView['verified'], t: ComparisonTexts): string[] {
  const warnings: string[] = [];
  if (!verified.sameBrief) warnings.push(t.warnings.sameBrief);
  if (!verified.sameReferences) warnings.push(t.warnings.sameReferences);
  if (!verified.onlyComparedDiffers) warnings.push(t.warnings.onlyComparedDiffers);
  return warnings;
}
