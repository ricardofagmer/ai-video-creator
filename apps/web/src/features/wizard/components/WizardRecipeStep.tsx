'use client';

import { type RecipeVersionView } from '@studio/shared/api';
import { Card, RadioGroup, useI18n } from '@studio/ui';
import { type ReactElement } from 'react';
import { languageLabels } from '@/features/recipes/recipe-labels';
import { useWebMessages } from '@/lib/i18n/client';

interface WizardRecipeStepProps {
  /** Runnable versions (draft or active), the list "Nova execução" offers. */
  recipes: readonly RecipeVersionView[];
  selectedRef: string;
  error?: string;
  onChoose: (ref: string) => void;
}

/** Step 2 "Receita": the base recipe, with its format, language and duration range under each name. */
export function WizardRecipeStep({ recipes, selectedRef, error, onChoose }: WizardRecipeStepProps): ReactElement {
  const t = useWebMessages();
  const { ui } = useI18n();
  const texts = t.wizard.recipe;
  const options = recipes.map((view) => {
    const { format } = view.recipe;
    return {
      value: view.ref,
      label: texts.option(view.recipe.name, view.recipe.version, ui.status.asset[view.recipe.status]),
      description: texts.facts(format.aspect, languageLabels[format.language], format.duration.minSec, format.duration.maxSec),
    };
  });
  return (
    <Card title={t.wizard.steps.recipe} description={texts.description}>
      <RadioGroup
        name="criar-receita"
        legend={texts.legend}
        options={options}
        value={selectedRef === '' ? null : selectedRef}
        onChange={onChoose}
        error={error}
      />
    </Card>
  );
}
