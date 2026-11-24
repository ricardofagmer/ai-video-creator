'use client';

import type { ReactElement } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import { StatusBadge } from '../status/StatusBadge';
import type { StepStatus } from '../status/status-types';
import styles from './StepTimeline.module.css';

export interface TimelineStep {
  /** Step id (`brief`, `preflight`, `snapshot`, `execute`, `verify`, `archive`, `record`). */
  id: string;
  /** Step name in pt-BR, for example "Pré-checagem". */
  label: string;
  status: StepStatus;
  /** Short result or reason, for example "2 tentativas, 1 recuperação". */
  detail?: string;
  /** Already formatted, for example "1 min 12 s". */
  durationLabel?: string;
}

export interface TimelineStage {
  id: string;
  label: string;
  /** Aggregate status of the stage (the worst of its steps, or `ok` once recorded). */
  status: StepStatus;
  steps: readonly TimelineStep[];
  /** Already formatted, for example "US$ 0,12". */
  costLabel?: string;
}

export interface TimelinePhase {
  id: string;
  /** "Pré-produção", "Produção", "Pós-produção", "Entrega" (PRD 7.1). */
  label: string;
  stages: readonly TimelineStage[];
}

export interface StepTimelineProps {
  phases: readonly TimelinePhase[];
  /** Stage and step that `now.json` reports; the stage opens and the step gets `aria-current="step"`. */
  current?: { stageId: string; stepId: string };
  label?: string;
  className?: string;
}

/** Run timeline: phases, then stages (expandable), then the seven fixed steps with their status. */
export function StepTimeline({ phases, current, label, className }: StepTimelineProps): ReactElement {
  const { ui } = useI18n();
  return (
    <div role="region" aria-label={label ?? ui.runs.timelineLabel} className={classNames(styles.timeline, className)}>
      {phases.map((phase) => (
        <section key={phase.id} aria-labelledby={`phase-${phase.id}`} className={styles.phase}>
          <h3 id={`phase-${phase.id}`} className={classNames('overline', styles.phaseTitle)}>
            {phase.label}
          </h3>
          <ol className={styles.stages}>
            {phase.stages.map((stage) => {
              const isCurrentStage = current?.stageId === stage.id;
              return (
                <li key={stage.id} className={classNames(styles.stage, styles[stage.status])}>
                  <details open={isCurrentStage || stage.status === 'failed'} className={styles.details}>
                    <summary className={styles.summary}>
                      <span aria-hidden="true" className={styles.marker} />
                      <span className={styles.stageLabel}>{stage.label}</span>
                      <StatusBadge kind="step" status={stage.status} />
                      {stage.costLabel && <span className={classNames('caption', styles.cost)}>{stage.costLabel}</span>}
                    </summary>
                    <ol className={styles.steps} aria-label={ui.runs.stepsOf(stage.label)}>
                      {stage.steps.map((step) => {
                        const isCurrentStep = isCurrentStage && current?.stepId === step.id;
                        return (
                          <li
                            key={step.id}
                            aria-current={isCurrentStep ? 'step' : undefined}
                            className={classNames(styles.step, styles[step.status], isCurrentStep && styles.currentStep)}
                          >
                            <span aria-hidden="true" className={styles.stepMarker} />
                            <span className={styles.stepLabel}>{step.label}</span>
                            <StatusBadge kind="step" status={step.status} />
                            {step.durationLabel && <span className="caption">{step.durationLabel}</span>}
                            {step.detail && <span className={classNames('caption', styles.stepDetail)}>{step.detail}</span>}
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
