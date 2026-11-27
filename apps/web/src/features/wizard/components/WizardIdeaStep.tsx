'use client';

import { Card } from '@studio/ui';
import { type Recipe } from '@studio/shared/recipes';
import { type ReactElement } from 'react';
import { RunBriefFields } from '@/features/runs/components/RunBriefFields';
import { RunInstructionsField } from '@/features/runs/components/RunInstructionsField';
import { type NewRunErrors, type NewRunField, type NewRunFormValues } from '@/features/runs/new-run-model';
import { useWebMessages } from '@/lib/i18n/client';

interface WizardIdeaStepProps {
  values: NewRunFormValues;
  errors: NewRunErrors;
  /** The base recipe once step 2 chose it: it decides the key messages and the duration range. */
  recipe: Recipe | undefined;
  instructions: string;
  onChange: (field: NewRunField, value: string) => void;
  onInstructionsChange: (text: string) => void;
}

/** Step 0 "Ideia": the new-run form's own brief and instructions fields, so both build the same brief. */
export function WizardIdeaStep({ values, errors, recipe, instructions, onChange, onInstructionsChange }: WizardIdeaStepProps): ReactElement {
  const t = useWebMessages();
  return (
    <>
      <Card title={t.wizard.idea.briefCard} description={t.wizard.idea.briefDescription}>
        <RunBriefFields values={values} errors={errors} recipe={recipe} disabled={false} onChange={onChange} />
      </Card>
      <Card title={t.runs.instructions.card}>
        <RunInstructionsField id="criar-instrucoes" value={instructions} onChange={onInstructionsChange} />
      </Card>
    </>
  );
}
