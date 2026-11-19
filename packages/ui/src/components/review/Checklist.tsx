import { useId, type ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import { Badge } from '../badge/Badge';
import styles from './Checklist.module.css';

export interface ChecklistItem {
  /** Item key from the recipe checklist (for example `claimsVerified`). */
  id: string;
  /** pt-BR text of the item. */
  label: string;
  /** Approval is refused while a required item is unchecked (R1-17, R1-20). */
  required: boolean;
  checked: boolean;
}

export interface ChecklistProps {
  items: readonly ChecklistItem[];
  onChange: (id: string, checked: boolean) => void;
  legend?: string;
  /** For example "Marque todos os itens obrigatórios para aprovar." */
  error?: string;
  disabled?: boolean;
  idPrefix?: string;
  className?: string;
}

/** Publish checklist of the review form (D14: 8 items by default, configurable per recipe). */
export function Checklist({
  items,
  onChange,
  legend = 'Checklist de publicação',
  error,
  disabled = false,
  idPrefix = 'checklist',
  className,
}: ChecklistProps): ReactElement {
  const progressId = useId();
  const errorId = useId();
  const checkedCount = items.filter((item) => item.checked).length;
  const describedBy = [progressId, error ? errorId : undefined].filter(Boolean).join(' ');

  return (
    <fieldset disabled={disabled} aria-describedby={describedBy} className={classNames(styles.fieldset, className)}>
      <legend className="label">{legend}</legend>
      <p id={progressId} className={classNames('caption', styles.progress)}>
        {checkedCount} de {items.length} itens marcados
      </p>
      <ul className={styles.list}>
        {items.map((item) => {
          const inputId = `${idPrefix}-${item.id}`;
          const missing = Boolean(error) && item.required && !item.checked;
          return (
            <li key={item.id} className={classNames(styles.item, item.checked && styles.checked)}>
              <input
                id={inputId}
                type="checkbox"
                checked={item.checked}
                aria-invalid={missing ? true : undefined}
                onChange={(event) => onChange(item.id, event.currentTarget.checked)}
                className={styles.input}
              />
              <label htmlFor={inputId} className={classNames('body-sm', styles.label)}>
                {item.label}
              </label>
              {item.required && <Badge tone={missing ? 'danger' : 'neutral'}>Obrigatório</Badge>}
            </li>
          );
        })}
      </ul>
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
