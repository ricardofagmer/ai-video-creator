import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import { Label } from './Label';
import styles from './Field.module.css';

/** Props a FormField hands to its control so label, help and error stay wired. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-required'?: true;
  invalid: boolean;
  disabled?: boolean;
}

export interface FormFieldProps {
  /** Id of the control; help and error use `{id}-help` and `{id}-error`. */
  id: string;
  label: ReactNode;
  /** Help text, shown while there is no error. */
  help?: ReactNode;
  /** Error message: replaces the help and marks the control invalid. */
  error?: ReactNode;
  optional?: boolean;
  disabled?: boolean;
  className?: string;
  /** Renders the control (Input, Textarea, Select, UploadDropzone…) with the wiring props. */
  children: (control: FieldControlProps) => ReactNode;
}

export function FormField({
  id,
  label,
  help,
  error,
  optional = false,
  disabled = false,
  className,
  children,
}: FormFieldProps): ReactElement {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const hasError = Boolean(error);
  const hasHelp = !hasError && Boolean(help);
  const describedBy = hasError ? errorId : hasHelp ? helpId : undefined;

  return (
    <div className={classNames(styles.field, className)}>
      <Label htmlFor={id} optional={optional} disabled={disabled}>
        {label}
      </Label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-required': optional ? undefined : true,
        invalid: hasError,
        disabled,
      })}
      {hasError && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
      {hasHelp && (
        <p id={helpId} className={classNames('caption', styles.help)}>
          {help}
        </p>
      )}
    </div>
  );
}
