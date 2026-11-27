import { classNames } from '@studio/ui';
import { type ReactElement } from 'react';
import { type WebMessages } from '@/messages';
import { isDraftStep, stepNumber, wizardSteps, type DraftStep, type WizardStep } from '../wizard-steps';
import styles from '../wizard.module.css';

interface WizardStepListProps {
  current: WizardStep;
  texts: WebMessages['wizard'];
  /** Given by the draft flow: the steps answered in the browser become buttons. Without it the list is plain. */
  onSelect?: (step: DraftStep) => void;
}

/**
 * Where the owner is among the seven steps. In the draft flow the five browser steps are buttons that
 * jump there (the flow still checks the steps in between); production and result stay plain, as the
 * run does not exist yet. No hooks, so the server result page renders the plain list too.
 */
export function WizardStepList({ current, texts, onSelect }: WizardStepListProps): ReactElement {
  const currentIndex = stepNumber(current);
  return (
    <div>
      <p className="visually-hidden">{texts.stepPosition(currentIndex + 1, wizardSteps.length)}</p>
      <ol className={styles.steps} aria-label={texts.stepsLabel}>
        {wizardSteps.map((step, index) => {
          const content = (
            <>
              <span className={styles.stepNumber} aria-hidden="true">
                {index}
              </span>
              <span className={styles.stepLabel}>{texts.steps[step]}</span>
            </>
          );
          return (
            <li
              key={step}
              aria-current={step === current ? 'step' : undefined}
              className={classNames(styles.step, step === current && styles.stepCurrent, index < currentIndex && styles.stepDone)}
            >
              {onSelect !== undefined && isDraftStep(step) && step !== current ? (
                <button type="button" className={styles.stepButton} onClick={() => onSelect(step)}>
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
