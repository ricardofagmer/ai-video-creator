'use client';

import type { ComponentProps, ReactElement } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import styles from './Field.module.css';

export interface LabelProps extends ComponentProps<'label'> {
  /** Adds the "(opcional)" mark; fields are required by default. */
  optional?: boolean;
  disabled?: boolean;
}

export function Label({ optional = false, disabled = false, className, children, ...props }: LabelProps): ReactElement {
  const { ui } = useI18n();
  return (
    <label {...props} className={classNames('label', styles.label, disabled && styles.labelDisabled, className)}>
      {children}
      {optional && <span className={styles.optional}> {ui.form.optional}</span>}
    </label>
  );
}
