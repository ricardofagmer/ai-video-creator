import type { ComponentProps, ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Control.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'children'> {
  options: readonly SelectOption[];
  /** First, empty option (for example "Selecione…"); it cannot be chosen again once a value is set. */
  placeholder?: string;
  invalid?: boolean;
}

export function Select({ options, placeholder, invalid = false, className, ...props }: SelectProps): ReactElement {
  return (
    <span className={styles.selectWrapper}>
      <select
        {...props}
        aria-invalid={invalid ? true : props['aria-invalid']}
        className={classNames(styles.control, styles.select, className)}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}
