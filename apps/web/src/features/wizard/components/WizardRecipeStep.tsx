'use client';

import { type RecipeVersionView } from '@studio/shared/api';
import { Button, Card, Dialog, RadioGroup, useI18n } from '@studio/ui';
import { useState, type ReactElement } from 'react';
import { languageLabels } from '@/features/recipes/recipe-labels';
import { RunReferencesPicker } from '@/features/runs/components/RunReferencesPicker';
import { useWebMessages } from '@/lib/i18n/client';

interface WizardRecipeStepProps {
  /** Runnable versions (draft or active), the list "Nova execução" offers. */
  recipes: readonly RecipeVersionView[];
  selectedRef: string;
  error?: string;
  onChoose: (ref: string) => void;
  /** The step 1 references, editable from here too. */
  references: readonly string[];
  onReferencesChange: (refs: string[]) => void;
}

/**
 * Step 2 "Receita": the base recipe, with its format, language and duration range under each name.
 * A button opens the step 1 reference picker in a dialog, so a reference remembered while composing
 * does not cost a trip back.
 */
export function WizardRecipeStep({ recipes, selectedRef, error, onChoose, references, onReferencesChange }: WizardRecipeStepProps): ReactElement {
  const t = useWebMessages();
  const { ui } = useI18n();
  const texts = t.wizard.recipe;
  const [pickingReferences, setPickingReferences] = useState(false);
  const options = recipes.map((view) => {
    const { format } = view.recipe;
    return {
      value: view.ref,
      label: texts.option(view.recipe.name, view.recipe.version, ui.status.asset[view.recipe.status]),
      description: texts.facts(format.aspect, languageLabels[format.language], format.duration.minSec, format.duration.maxSec),
    };
  });
  return (
    <>
      <Card
        title={t.wizard.steps.recipe}
        description={texts.description}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setPickingReferences(true)}>
            {texts.addReferences(references.length)}
          </Button>
        }
      >
        <RadioGroup
          name="criar-receita"
          legend={texts.legend}
          options={options}
          value={selectedRef === '' ? null : selectedRef}
          onChange={onChoose}
          error={error}
        />
      </Card>
      <Dialog
        open={pickingReferences}
        onClose={() => setPickingReferences(false)}
        size="wide"
        title={t.wizard.references.card}
        description={t.wizard.references.description}
        footer={<Button onClick={() => setPickingReferences(false)}>{texts.referencesDone}</Button>}
      >
        <RunReferencesPicker selected={references} onChange={onReferencesChange} disabled={false} />
      </Dialog>
    </>
  );
}
