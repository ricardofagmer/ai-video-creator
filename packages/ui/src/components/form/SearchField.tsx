import type { ReactElement } from 'react';
import { Input, type InputProps } from './Input';
import styles from './Field.module.css';

export interface SearchFieldProps extends Omit<InputProps, 'type' | 'id'> {
  id: string;
  /** Accessible label; hidden visually, since the placeholder and context explain the field. */
  label: string;
}

/** Lexical search box wrapped in a `search` landmark. */
export function SearchField({ id, label, ...props }: SearchFieldProps): ReactElement {
  return (
    <div role="search" className={styles.search}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <Input {...props} id={id} type="search" />
    </div>
  );
}
