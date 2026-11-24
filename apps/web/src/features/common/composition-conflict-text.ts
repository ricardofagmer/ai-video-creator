import { formatNumber, type Locale } from '@studio/ui';
import { type CompositionConflict } from '@studio/shared/recipes';
import { ApiRequestError } from '@/lib/api';
import { type WebMessages } from '@/messages';

/**
 * One owner-facing sentence per composition conflict (guided-creation spec section 3). Core and the
 * shared rules send ids and numbers only, so every screen builds the same sentence here, in the
 * active language.
 */
export function compositionConflictText(conflict: CompositionConflict, t: WebMessages, locale: Locale): string {
  const texts = t.common.compositionConflicts;
  const number = (value: number): string => formatNumber(value, locale, { maximumFractionDigits: 1 });
  switch (conflict.rule) {
    case 'duplicate-kind':
      return texts.duplicateKind[conflict.kind](conflict.refs.length);
    case 'stage-needs-binding':
      return texts.stageNeedsBinding[conflict.stageId];
    case 'template-format-mismatch':
      return texts.formatMismatch[conflict.field](conflict.recipe, conflict.template);
    case 'duration-outside-template': {
      const range = {
        requestedMin: number(conflict.requestedMinSec),
        requestedMax: number(conflict.requestedMaxSec),
        templateMin: number(conflict.templateMinSec),
        templateMax: number(conflict.templateMaxSec),
      };
      return conflict.subject === 'run-target' ? texts.runTarget(range) : texts.recipeRange(range);
    }
  }
}

/** The sentences of a list, without repeats (two rules can name the same thing in the same words). */
export function compositionConflictTexts(conflicts: readonly CompositionConflict[], t: WebMessages, locale: Locale): string[] {
  return [...new Set(conflicts.map((conflict) => compositionConflictText(conflict, t, locale)))];
}

/** `details.conflicts` of a 422 `composition-conflict` answer; empty for any other failure. */
export function conflictsOfApiError(error: unknown): readonly CompositionConflict[] {
  if (!(error instanceof ApiRequestError) || error.reason !== 'composition-conflict') return [];
  return error.body?.details?.conflicts ?? [];
}
