import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Feedback.module.css';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Primary way out of the empty state (for example "Enviar ativo"). */
  action?: ReactNode;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

export function EmptyState({ title, description, action, headingLevel: Heading = 'h2', className }: EmptyStateProps): ReactElement {
  return (
    <div className={classNames(styles.state, className)}>
      <span aria-hidden="true" className={styles.mark} />
      <Heading className="heading-3">{title}</Heading>
      {description && <p className={classNames('caption', styles.text)}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
