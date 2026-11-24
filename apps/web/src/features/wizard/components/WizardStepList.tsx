import { classNames } from '@studio/ui';
import { type ReactElement } from 'react';
import { type WebMessages } from '@/messages';
import { stepNumber, wizardSteps, type WizardStep } from '../wizard-steps';
import styles from '../wizard.module.css';

interface WizardStepListProps {
  current: WizardStep;
  texts: WebMessages['wizard'];
}

/**
 * Where the owner is among the seven steps: a plain numbered list, not tabs and not links (the
 * owner moves with Voltar and Avançar). No hooks, so the server result page renders it too.
 */
export function WizardStepList({ current, texts }: WizardStepListProps): ReactElement {
  const currentIndex = stepNumber(current);
  return (
    <div>
      <p className="visually-hidden">{texts.stepPosition(currentIndex + 1, wizardSteps.length)}</p>
      <ol className={styles.steps} aria-label={texts.stepsLabel}>
        {wizardSteps.map((step, index) => (
          <li
            key={step}
            aria-current={step === current ? 'step' : undefined}
            className={classNames(styles.step, step === current && styles.stepCurrent, index < currentIndex && styles.stepDone)}
          >
            <span className={styles.stepNumber} aria-hidden="true">
              {index}
            </span>
            <span>{texts.steps[step]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
