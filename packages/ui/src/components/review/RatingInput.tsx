import { useId, type ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './RatingInput.module.css';

export type RatingValue = 1 | 2 | 3 | 4 | 5;

const ratingOptions: readonly { value: RatingValue; label: string }[] = [
  { value: 1, label: 'Muito ruim' },
  { value: 2, label: 'Ruim' },
  { value: 3, label: 'Razoável' },
  { value: 4, label: 'Bom' },
  { value: 5, label: 'Excelente' },
];

export interface RatingInputProps {
  /** Name of the radio group in the form. */
  name: string;
  value: RatingValue | null;
  onChange: (value: RatingValue) => void;
  legend?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** 1-5 rating of the review form (D14), as a native radio group: arrow keys move the choice. */
export function RatingInput({ name, value, onChange, legend = 'Nota', error, disabled = false, className }: RatingInputProps): ReactElement {
  const errorId = useId();
  return (
    <fieldset
      role="radiogroup"
      aria-required="true"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      disabled={disabled}
      className={classNames(styles.fieldset, className)}
    >
      <legend className="label">{legend}</legend>
      <div className={styles.options}>
        {ratingOptions.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className={styles.input}
            />
            <span aria-hidden="true" className={styles.pill}>
              {option.value}
            </span>
            <span className={classNames('caption', styles.optionLabel)}>
              <span className="visually-hidden">{option.value} — </span>
              {option.label}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
