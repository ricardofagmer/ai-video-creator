import type { ComponentProps, ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Field.module.css';

export interface LabelProps extends ComponentProps<'label'> {
  /** Adds the "(opcional)" mark; fields are required by default. */
  optional?: boolean;
  disabled?: boolean;
}

export function Label({ optional = false, disabled = false, className, children, ...props }: LabelProps): ReactElement {
  return (
    <label {...props} className={classNames('label', styles.label, disabled && styles.labelDisabled, className)}>
      {children}
      {optional && <span className={styles.optional}> (opcional)</span>}
    </label>
  );
}
