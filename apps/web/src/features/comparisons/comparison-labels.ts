import { type BadgeTone } from '@studio/ui';
import { type ComparisonArmView, type ComparisonView } from '@studio/shared/api';
import { type ComparisonSubject, type RunStatus } from '@studio/shared/run-format';
import { slotSpecs } from '@/features/recipes/recipe-slots';
import { formatDecimal, reviewSubjectLabels } from '@/features/review/review-labels';

type ComparisonStatus = ComparisonView['status'];

export const comparisonStatusLabels: Readonly<Record<ComparisonStatus, string>> = {
  draft: 'Rascunho',
  running: 'Em andamento',
  ready: 'Pronta',
  incomplete: 'Incompleta',
};

export const comparisonStatusTones: Readonly<Record<ComparisonStatus, BadgeTone>> = {
  draft: 'neutral',
  running: 'info',
  ready: 'success',
  incomplete: 'warning',
};

/** Statuses after which a run has rendered its final video (`rejected` only with a manifest). */
export const finishedRunStatuses: readonly RunStatus[] = ['review', 'approved', 'rejected'];

export const armLabels: Readonly<Record<ComparisonArmView['arm'], string>> = { a: 'Versão A', b: 'Versão B' };

/** The pt-BR label of a recipe binding slot, or the slot itself when the editor does not know it. */
export function slotLabel(slot: string): string {
  return slotSpecs.find((spec) => spec.slot === slot)?.label ?? slot;
}

/** One line naming what the comparison compares. */
export function subjectText(subject: ComparisonSubject): string {
  if (subject.kind === 'asset-binding') return `${slotLabel(subject.slot)}: ${subject.a} contra ${subject.b}`;
  return `Receita: ${subject.a} contra ${subject.b}`;
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

export function qaText(qa: ComparisonArmView['qa']): string {
  if (qa === null) return 'Sem resultado de QA ainda';
  if (qa.outcome === 'passed') return 'Passou no QA';
  return qa.warnings === 1 ? 'Passou no QA com 1 aviso' : `Passou no QA com ${qa.warnings} avisos`;
}

export function decisionText(decision: ComparisonArmView['decision']): string {
  if (decision === null) return 'Sem decisão ainda';
  const outcome = decision.outcome === 'approved' ? 'Aprovada' : 'Rejeitada';
  return `${outcome}, nota ${decision.rating} de 5`;
}

export function reviewerScoresText(scores: ComparisonArmView['reviewerScores']): string {
  if (scores.length === 0) return 'Sem notas do revisor ainda';
  return scores.map((score) => `${reviewSubjectLabels[score.subject]} ${formatDecimal(score.overall)}`).join(' · ');
}

export function recoveriesText(recoveries: number): string {
  if (recoveries === 0) return 'Nenhuma';
  return recoveries === 1 ? '1 recuperação' : `${recoveries} recuperações`;
}

/** The `verified` flags that failed, as sentences for the warning on the comparison page. */
export function verificationWarnings(verified: ComparisonView['verified']): string[] {
  const warnings: string[] = [];
  if (!verified.sameBrief) warnings.push('Os briefings das duas execuções não são iguais.');
  if (!verified.sameReferences) warnings.push('As referências das duas execuções não são iguais.');
  if (!verified.onlyComparedDiffers) warnings.push('As receitas das duas execuções diferem em mais do que a versão comparada.');
  return warnings;
}
