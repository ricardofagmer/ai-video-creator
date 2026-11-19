import type { ComponentProps, ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Control.module.css';

export interface InputProps extends ComponentProps<'input'> {
  /** Visible error: border in `--color-danger` and `aria-invalid="true"`. */
  invalid?: boolean;
  /** Monospace text, for identifiers, refs and hashes. */
  mono?: boolean;
}

export function Input({ invalid = false, mono = false, className, ...props }: InputProps): ReactElement {
  return (
    <input
      {...props}
      aria-invalid={invalid ? true : props['aria-invalid']}
      className={classNames(styles.control, mono && styles.mono, className)}
    />
  );
}
