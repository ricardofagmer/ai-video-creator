import { useId, type ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Field.module.css';

export interface RadioOption<Value extends string> {
  value: Value;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps<Value extends string> {
  /** Name of the radio inputs in the form. */
  name: string;
  legend: string;
  options: readonly RadioOption<Value>[];
  value: Value | null;
  onChange: (value: Value) => void;
  /** Options side by side from `sm` up. */
  inline?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** Native radio group with a legend; arrow keys move the choice. */
export function RadioGroup<Value extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  inline = false,
  error,
  disabled = false,
  className,
}: RadioGroupProps<Value>): ReactElement {
  const groupId = useId();
  const errorId = `${groupId}-error`;
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={error ? errorId : undefined}
      className={classNames(styles.radioGroup, className)}
    >
      <legend className={classNames('label', styles.legend)}>{legend}</legend>
      <div className={classNames(styles.radioOptions, inline && styles.radioOptionsInline)}>
        {options.map((option) => {
          const inputId = `${groupId}-${option.value}`;
          const descriptionId = option.description ? `${inputId}-description` : undefined;
          return (
            <div key={option.value} className={styles.checkbox}>
              <input
                id={inputId}
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                disabled={option.disabled}
                aria-invalid={error ? true : undefined}
                aria-describedby={descriptionId}
                onChange={() => onChange(option.value)}
                className={styles.checkboxInput}
              />
              <span className={styles.checkboxText}>
                <label htmlFor={inputId} className="label">
                  {option.label}
                </label>
                {option.description && (
                  <span id={descriptionId} className="caption">
                    {option.description}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
