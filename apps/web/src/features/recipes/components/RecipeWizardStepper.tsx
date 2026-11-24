import { classNames } from '@studio/ui';
import { type ReactElement, type Ref } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { recipeWizardSteps, wizardProgress, type RecipeWizardStep } from '../recipe-wizard-steps';
import styles from './RecipeWizardStepper.module.css';

interface RecipeWizardStepperProps {
  current: RecipeWizardStep;
  /** The step heading; it takes focus when the step changes. */
  headingRef: Ref<HTMLHeadingElement>;
}

/**
 * Where the owner is in the new-recipe wizard: the share reached, every step marked done, current or
 * upcoming, and the current step's heading. Not links: the owner moves with Voltar and Avançar.
 */
export function RecipeWizardStepper({ current, headingRef }: RecipeWizardStepperProps): ReactElement {
  const texts = useWebMessages().recipes.wizard;
  const currentIndex = recipeWizardSteps.indexOf(current);
  const percent = wizardProgress(current);
  return (
    <div className={styles.root}>
      <div className={styles.progressRow}>
        <div
          className={styles.track}
          role="progressbar"
          aria-label={texts.progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={texts.progress(percent)}
        >
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
        <span className={styles.percent} aria-hidden="true">
          {percent}%
        </span>
      </div>
      <ol className={styles.steps} aria-label={texts.stepsLabel}>
        {recipeWizardSteps.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
          return (
            <li
              key={step}
              aria-current={state === 'current' ? 'step' : undefined}
              className={classNames(styles.step, state === 'current' && styles.current, state === 'done' && styles.done)}
            >
              <span className={styles.marker} aria-hidden="true">
                {state === 'done' ? '✓' : index + 1}
              </span>
              <span>{texts.steps[step]}</span>
              <span className="visually-hidden">{texts.states[state]}</span>
            </li>
          );
        })}
      </ol>
      <h2 ref={headingRef} tabIndex={-1} className={classNames('heading-2', styles.heading)}>
        <span className="visually-hidden">{texts.stepPosition(currentIndex + 1, recipeWizardSteps.length)}: </span>
        {texts.steps[current]}
      </h2>
    </div>
  );
}
