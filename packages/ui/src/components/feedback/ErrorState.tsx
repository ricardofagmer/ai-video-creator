'use client';

import type { ReactElement, ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
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
  title,
  description,
  action,
  className,
}: ErrorStateProps): ReactElement {
  const { ui } = useI18n();
  return (
    <div role="alert" className={classNames(styles.state, styles.error, className)}>
      <span aria-hidden="true" className={classNames(styles.mark, styles.errorMark)} />
      <p className={classNames('heading-3', styles.errorTitle)}>{title ?? ui.feedback.errorTitle}</p>
      {description && <p className={classNames('caption', styles.text)}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
