'use client';

import { useId, type ReactElement } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import styles from './RatingInput.module.css';

export type RatingValue = 1 | 2 | 3 | 4 | 5;

const ratingValues: readonly RatingValue[] = [1, 2, 3, 4, 5];

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
export function RatingInput({ name, value, onChange, legend, error, disabled = false, className }: RatingInputProps): ReactElement {
  const { ui } = useI18n();
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
      <legend className="label">{legend ?? ui.review.ratingLegend}</legend>
      <div className={styles.options}>
        {ratingValues.map((ratingValue) => (
          <label key={ratingValue} className={styles.option}>
            <input
              type="radio"
              name={name}
              value={ratingValue}
              checked={value === ratingValue}
              onChange={() => onChange(ratingValue)}
              className={styles.input}
            />
            <span aria-hidden="true" className={styles.pill}>
              {ratingValue}
            </span>
            <span className={classNames('caption', styles.optionLabel)}>
              <span className="visually-hidden">{ratingValue} — </span>
              {ui.review.ratings[ratingValue]}
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
