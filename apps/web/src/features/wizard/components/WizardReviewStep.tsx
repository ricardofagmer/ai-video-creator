'use client';

import { type CompositionConflict } from '@studio/shared/recipes';
import { Alert, Button, Card, DescriptionList, useI18n, type DescriptionItem } from '@studio/ui';
import { type ReactElement } from 'react';
import { CompositionConflictList } from '@/features/common/components/CompositionConflictList';
import layout from '@/features/common/layout.module.css';
import { type BindingOption } from '@/features/recipes/recipe-form-model';
import { languageLabels } from '@/features/recipes/recipe-labels';
import { newRunFieldOrder } from '@/features/runs/new-run-model';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { type WizardDraft } from '../wizard-draft';
import { basePinOf, wizardSlotsOf, type WizardSlot } from '../wizard-recipe';
import { type WizardReview } from '../wizard-review';
import { stepsToFix, type DraftStep } from '../wizard-steps';
import styles from '../wizard.module.css';

const CONFLICTS_ID = 'criar-conflitos';
const BRIEF_PROBLEMS_ID = 'criar-problemas-ideia';

interface WizardReviewStepProps {
  review: Extract<WizardReview, { kind: 'ready' }>;
  draft: WizardDraft;
  options: readonly BindingOption[];
  /** The list a 422 `composition-conflict` answer carried; shown when the browser found none. */
  serverConflicts: readonly CompositionConflict[];
  starting: boolean;
  /** The failure of the last "Iniciar", already worded. */
  failure: string | null;
  onEdit: (step: DraftStep) => void;
  onStart: () => void;
}

type ReviewTexts = WebMessages['wizard']['review'];

function slotTerm(slot: WizardSlot, texts: ReviewTexts): string {
  if (slot === 'voice') return texts.voice;
  if (slot === 'template') return texts.template;
  if (slot === 'brand-kit') return texts.brandKit;
  return texts.music;
}

/** The catalog name of a pinned version when the server loaded it, else the ref itself. */
function pinLabel(ref: string | undefined, options: readonly BindingOption[], texts: ReviewTexts): string {
  if (ref === undefined) return texts.none;
  return options.find((option) => option.ref === ref)?.label ?? ref;
}

/**
 * Step 4 "Revisão": everything the run will use, the brief problems and composition conflicts
 * with a way back to the step that fixes each, and "Iniciar", disabled while any is left.
 */
export function WizardReviewStep(props: WizardReviewStepProps): ReactElement {
  const { review, draft, options, serverConflicts, starting, failure, onEdit, onStart } = props;
  const t = useWebMessages();
  const { ui } = useI18n();
  const texts = t.wizard.review;
  const { base, composed, brief } = review;
  const values = draft.values;
  // The browser's own list wins: it reflects the current choices, the server's the last attempt.
  const conflicts = review.conflicts.length > 0 ? review.conflicts : serverConflicts;
  const briefErrors = brief.kind === 'invalid' ? newRunFieldOrder.flatMap((field) => brief.errors[field] ?? []) : [];
  const blocked = conflicts.length > 0 || briefErrors.length > 0;
  const describedBy = [briefErrors.length > 0 ? BRIEF_PROBLEMS_ID : null, conflicts.length > 0 ? CONFLICTS_ID : null].filter((id) => id !== null).join(' ');

  const ideaItems: DescriptionItem[] = [
    { term: texts.topic, description: values.topic.trim() },
    ...(values.sourceUrl.trim() === '' ? [] : [{ term: texts.sourceUrl, description: values.sourceUrl.trim(), mono: true }]),
    ...(values.keyMessages.trim() === '' ? [] : [{ term: texts.keyMessages, description: values.keyMessages.trim() }]),
    { term: texts.duration, description: texts.durationValue(values.targetDurationSec.trim()) },
    { term: texts.language, description: languageLabels[composed.recipe.format.language] },
    ...(draft.instructions.trim() === '' ? [] : [{ term: texts.instructions, description: draft.instructions.trim() }]),
  ];
  const recipeItems: DescriptionItem[] = [
    { term: texts.recipe, description: t.wizard.recipe.option(base.recipe.name, base.recipe.version, ui.status.asset[base.recipe.status]) },
    ...wizardSlotsOf(base.recipe).map((spec) => ({
      term: slotTerm(spec.slot, texts),
      description: pinLabel(basePinOf(composed.recipe, spec.slot)?.ref, options, texts),
    })),
  ];

  return (
    <div className={layout.stack}>
      <Card title={texts.ideaCard} actions={<EditButton label={texts.change} onClick={() => onEdit('idea')} />}>
        <DescriptionList items={ideaItems} />
      </Card>
      <Card title={texts.referencesCard} actions={<EditButton label={texts.change} onClick={() => onEdit('references')} />}>
        <p>{draft.references.length === 0 ? t.wizard.references.none : texts.referencesCount(draft.references.length)}</p>
      </Card>
      <Card title={texts.recipeCard} actions={<EditButton label={texts.change} onClick={() => onEdit('style')} />}>
        <div className={layout.stack}>
          <DescriptionList items={recipeItems} />
          <p className="caption">{composed.changed ? texts.newVersion : texts.sameVersion}</p>
        </div>
      </Card>

      {briefErrors.length > 0 && (
        <div id={BRIEF_PROBLEMS_ID}>
          <Alert variant="warning" title={texts.briefProblems} actions={<EditButton label={texts.fixStep(t.wizard.steps.idea)} onClick={() => onEdit('idea')} />}>
            <ul>
              {briefErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      <CompositionConflictList conflicts={conflicts} id={CONFLICTS_ID} />
      {conflicts.length > 0 && (
        <div className={styles.footer}>
          {stepsToFix(conflicts).map((step) => (
            <EditButton key={step} label={texts.fixStep(t.wizard.steps[step])} onClick={() => onEdit(step)} />
          ))}
        </div>
      )}
      {failure !== null && <Alert variant="error">{failure}</Alert>}

      <div className={styles.footer}>
        <Button variant="secondary" onClick={() => onEdit('style')} disabled={starting}>
          {t.wizard.back}
        </Button>
        <span className={styles.footerEnd}>
          <Button
            onClick={onStart}
            disabled={blocked}
            loading={starting}
            loadingLabel={texts.starting}
            aria-describedby={describedBy === '' ? undefined : describedBy}
          >
            {texts.start}
          </Button>
        </span>
      </div>
    </div>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }): ReactElement {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}
