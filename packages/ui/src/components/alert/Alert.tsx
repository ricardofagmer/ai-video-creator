import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Alert.module.css';

export type AlertVariant = 'success' | 'error' | 'warning' | 'info';

/** `alert` (immediate) for error and warning; `status` (polite) for success and info. */
const roles: Readonly<Record<AlertVariant, 'alert' | 'status'>> = {
  success: 'status',
  error: 'alert',
  warning: 'alert',
  info: 'status',
};

export interface AlertProps {
  variant: AlertVariant;
  title?: ReactNode;
  children: ReactNode;
  /** Buttons or links under the message. */
  actions?: ReactNode;
  className?: string;
}

export function Alert({ variant, title, children, actions, className }: AlertProps): ReactElement {
  return (
    <div role={roles[variant]} className={classNames(styles.alert, styles[variant], className)}>
      {title && <p className={styles.title}>{title}</p>}
      <div className={styles.message}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
