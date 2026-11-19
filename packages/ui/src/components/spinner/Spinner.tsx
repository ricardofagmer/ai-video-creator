import type { ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Spinner.module.css';

export type SpinnerSize = 'sm' | 'md';

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Accessible text when the spinner stands alone (default "Carregando"). */
  label?: string;
  /** Hides the spinner from assistive technology when the parent already reports the state. */
  decorative?: boolean;
  className?: string;
}

export function Spinner({ size = 'md', label = 'Carregando', decorative = false, className }: SpinnerProps): ReactElement {
  if (decorative) {
    return <span aria-hidden="true" className={classNames(styles.spinner, styles[size], className)} />;
  }
  return (
    <span role="status" className={classNames(styles.wrapper, className)}>
      <span aria-hidden="true" className={classNames(styles.spinner, styles[size])} />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
