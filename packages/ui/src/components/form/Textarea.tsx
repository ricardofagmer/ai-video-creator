import type { ComponentProps, ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Control.module.css';

export interface TextareaProps extends ComponentProps<'textarea'> {
  invalid?: boolean;
}

export function Textarea({ invalid = false, rows = 4, className, ...props }: TextareaProps): ReactElement {
  return (
    <textarea
      {...props}
      rows={rows}
      aria-invalid={invalid ? true : props['aria-invalid']}
      className={classNames(styles.control, styles.textarea, className)}
    />
  );
}
