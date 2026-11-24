'use client';

import { Card, Checkbox } from '@studio/ui';
import { mandatoryStages, PhaseIdSchema, stageOrder, stagePhase, type StageId } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { recipeFieldIds, type RecipeFormValues } from '../recipe-form-model';

export interface RecipeStagesSectionProps {
  enabledStages: readonly StageId[];
  /** `params.siteAnalysis` of the research stage. */
  siteAnalysis: boolean;
  error?: string;
  onChange: (enabledStages: StageId[]) => void;
  onSiteAnalysisChange: (siteAnalysis: boolean) => void;
}

/**
 * design/telas/06 card "Etapas": one fieldset per phase, one Checkbox per stage (A5). The research stage
 * is followed by its "analyse the site with AI" option (docs/specs/2026-11-23-site-analysis-design.md).
 */
export function RecipeStagesSection({ enabledStages, siteAnalysis, error, onChange, onSiteAnalysisChange }: RecipeStagesSectionProps): ReactElement {
  const t = useWebMessages();
  const texts = t.recipes.stages;
  const errorId = `${recipeFieldIds.stages}-error`;

  function toggle(stageId: StageId, checked: boolean): void {
    const next = new Set(enabledStages);
    if (checked) next.add(stageId);
    else next.delete(stageId);
    onChange(stageOrder.filter((candidate) => next.has(candidate)));
  }

  return (
    <fieldset id={recipeFieldIds.stages} tabIndex={-1} className={layout.fieldset} aria-describedby={error === undefined ? undefined : errorId}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title} description={texts.description}>
        <div className={layout.stack}>
          {PhaseIdSchema.options.map((phase) => (
            <fieldset key={phase} className={layout.fieldset}>
              <legend className="overline">{t.runs.phases[phase]}</legend>
              <div className={layout.checkGrid}>
                {stageOrder
                  .filter((stageId) => stagePhase[stageId] === phase)
                  .map((stageId) => {
                    const mandatory = mandatoryStages.includes(stageId);
                    const stageOn = mandatory || enabledStages.includes(stageId);
                    const stageBox = (
                      <Checkbox
                        key={stageId}
                        id={`etapa-${stageId}`}
                        label={t.runs.stages[stageId]}
                        description={mandatory ? texts.alwaysPresent : undefined}
                        checked={stageOn}
                        disabled={mandatory}
                        onChange={(event) => toggle(stageId, event.currentTarget.checked)}
                      />
                    );
                    if (stageId !== 'research') return stageBox;
                    // One grid cell, so the option sits under its stage instead of in the next column.
                    return (
                      <div key={stageId} className={layout.stack}>
                        {stageBox}
                        <Checkbox
                          id="etapa-research-analise-site"
                          label={texts.siteAnalysis}
                          description={stageOn ? texts.siteAnalysisHelp : texts.siteAnalysisNeedsStage}
                          checked={siteAnalysis && stageOn}
                          disabled={!stageOn}
                          onChange={(event) => onSiteAnalysisChange(event.currentTarget.checked)}
                        />
                      </div>
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
  const { recipes } = useWebMessages();
  const texts = recipes.gates;
  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title}>
        <div className={layout.stack}>
          <Checkbox id="portao-plano" label={texts.plan} description={recipes.stages.alwaysPresent} checked disabled readOnly />
          <Checkbox id="portao-final" label={texts.final} description={recipes.stages.alwaysPresent} checked disabled readOnly />
          <Checkbox
            id="portao-roteiro"
            label={texts.script}
            description={scriptEnabled ? undefined : texts.scriptNeedsStage}
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
  const texts = useWebMessages().recipes.inputs;
  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title}>
        <div className={layout.inlineList}>
          <Checkbox id="entrada-tema" label={texts.topic} checked disabled readOnly />
          <Checkbox
            id="entrada-url"
            label={texts.sourceUrl}
            checked={values.requireSourceUrl}
            onChange={(event) => onChange({ requireSourceUrl: event.currentTarget.checked })}
          />
          <Checkbox
            id="entrada-mensagens"
            label={texts.keyMessages}
            checked={values.requireKeyMessages}
            onChange={(event) => onChange({ requireKeyMessages: event.currentTarget.checked })}
          />
        </div>
      </Card>
    </fieldset>
  );
}
