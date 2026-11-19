import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Field.module.css';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'id'> {
  id: string;
  label: ReactNode;
  /** Secondary text under the label, linked by `aria-describedby`. */
  description?: ReactNode;
  invalid?: boolean;
}

export function Checkbox({ id, label, description, invalid = false, className, ...props }: CheckboxProps): ReactElement {
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={classNames(styles.checkbox, className)}>
      <input
        {...props}
        id={id}
        type="checkbox"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={descriptionId}
        className={styles.checkboxInput}
      />
      <span className={styles.checkboxText}>
        <label htmlFor={id} className="label">
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="caption">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}
