import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Feedback.module.css';

export interface ErrorStateProps {
  title?: string;
  /** What failed and what the owner can do; never a stack trace. */
  description?: ReactNode;
  /** Usually a "Tentar de novo" button. */
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Não foi possível carregar',
  description,
  action,
  className,
}: ErrorStateProps): ReactElement {
  return (
    <div role="alert" className={classNames(styles.state, styles.error, className)}>
      <span aria-hidden="true" className={classNames(styles.mark, styles.errorMark)} />
      <p className={classNames('heading-3', styles.errorTitle)}>{title}</p>
      {description && <p className={classNames('caption', styles.text)}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
