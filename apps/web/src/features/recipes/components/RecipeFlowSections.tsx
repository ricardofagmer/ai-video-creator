'use client';

import { Card, Checkbox } from '@studio/ui';
import { mandatoryStages, PhaseIdSchema, stageOrder, stagePhase, type StageId } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { phaseLabels, stageLabels } from '../recipe-labels';
import { recipeFieldIds, type RecipeFormValues } from '../recipe-form-model';

export interface RecipeStagesSectionProps {
  enabledStages: readonly StageId[];
  error?: string;
  onChange: (enabledStages: StageId[]) => void;
}

/** design/telas/06 card "Etapas": one fieldset per phase, one Checkbox per stage (A5). */
export function RecipeStagesSection({ enabledStages, error, onChange }: RecipeStagesSectionProps): ReactElement {
  const errorId = `${recipeFieldIds.stages}-error`;

  function toggle(stageId: StageId, checked: boolean): void {
    const next = new Set(enabledStages);
    if (checked) next.add(stageId);
    else next.delete(stageId);
    onChange(stageOrder.filter((candidate) => next.has(candidate)));
  }

  return (
    <fieldset id={recipeFieldIds.stages} tabIndex={-1} className={layout.fieldset} aria-describedby={error === undefined ? undefined : errorId}>
      <legend className="visually-hidden">Etapas</legend>
      <Card title="Etapas" description="Desligar uma etapa remove os vínculos dela.">
        <div className={layout.stack}>
          {PhaseIdSchema.options.map((phase) => (
            <fieldset key={phase} className={layout.fieldset}>
              <legend className="overline">{phaseLabels[phase]}</legend>
              <div className={layout.inlineList}>
                {stageOrder
                  .filter((stageId) => stagePhase[stageId] === phase)
                  .map((stageId) => {
                    const mandatory = mandatoryStages.includes(stageId);
                    return (
                      <Checkbox
                        key={stageId}
                        id={`etapa-${stageId}`}
                        label={stageLabels[stageId]}
                        description={mandatory ? 'Sempre presente em toda receita.' : undefined}
                        checked={mandatory || enabledStages.includes(stageId)}
                        disabled={mandatory}
                        onChange={(event) => toggle(stageId, event.currentTarget.checked)}
                      />
                    );
                  })}
              </div>
            </fieldset>
          ))}
          {error !== undefined && (
            <p id={errorId} className={layout.fieldError}>
              {error}
            </p>
          )}
        </div>
      </Card>
    </fieldset>
  );
}

export interface RecipeGatesSectionProps {
  scriptApproval: boolean;
  scriptEnabled: boolean;
  onChange: (scriptApproval: boolean) => void;
}

/** design/telas/06 card "Portões": plan and final are implicit in every recipe (PRD 7.3). */
export function RecipeGatesSection({ scriptApproval, scriptEnabled, onChange }: RecipeGatesSectionProps): ReactElement {
  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">Portões</legend>
      <Card title="Portões">
        <div className={layout.stack}>
          <Checkbox id="portao-plano" label="Aprovação do plano (sempre)" description="Sempre presente em toda receita." checked disabled readOnly />
          <Checkbox id="portao-final" label="Revisão final (sempre)" description="Sempre presente em toda receita." checked disabled readOnly />
          <Checkbox
            id="portao-roteiro"
            label="Aprovação do roteiro"
            description={scriptEnabled ? undefined : 'Ligue a etapa Roteiro para usar este portão.'}
            checked={scriptApproval && scriptEnabled}
            disabled={!scriptEnabled}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
        </div>
      </Card>
    </fieldset>
  );
}

export interface RecipeInputsSectionProps {
  values: Pick<RecipeFormValues, 'requireSourceUrl' | 'requireKeyMessages'>;
  onChange: (patch: Partial<RecipeFormValues>) => void;
}

/** design/telas/06 card "Entradas do briefing" (C2 `inputs`; the topic is always required). */
export function RecipeInputsSection({ values, onChange }: RecipeInputsSectionProps): ReactElement {
  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">Entradas do briefing</legend>
      <Card title="Entradas do briefing">
        <div className={layout.inlineList}>
          <Checkbox id="entrada-tema" label="Tema" checked disabled readOnly />
          <Checkbox
            id="entrada-url"
            label="URL de origem"
            checked={values.requireSourceUrl}
            onChange={(event) => onChange({ requireSourceUrl: event.currentTarget.checked })}
          />
          <Checkbox
            id="entrada-mensagens"
            label="Mensagens-chave"
            checked={values.requireKeyMessages}
            onChange={(event) => onChange({ requireKeyMessages: event.currentTarget.checked })}
          />
        </div>
      </Card>
    </fieldset>
  );
}
