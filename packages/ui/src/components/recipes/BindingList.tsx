'use client';

import type { ReactElement, ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import { FormField, type FieldControlProps } from '../form/FormField';
import styles from './BindingList.module.css';

export interface BindingListItem {
  /** Slot id from the recipe contract (C2), for example `template` or `prompt.scriptwriter`. */
  slot: string;
  /** Slot name in pt-BR, for example "Prompt do roteirista". */
  label: string;
  /** For example "Aceita: prompt". */
  allowedKindsLabel?: string;
  optional?: boolean;
  error?: string;
  /** Renders the asset version picker (usually a Select of `assetId@version`). */
  renderControl: (control: FieldControlProps) => ReactNode;
}

export interface BindingListProps {
  items: readonly BindingListItem[];
  /** Prefix of the control ids: `{idPrefix}-{slot}`. */
  idPrefix?: string;
  legend?: string;
  className?: string;
}

function slotToId(slot: string): string {
  return slot.replace(/[^a-zA-Z0-9-]/g, '-');
}

/** Recipe bindings: one row per slot, each pinning an `assetId@version` (PRD 6). */
export function BindingList({ items, idPrefix = 'binding', legend, className }: BindingListProps): ReactElement {
  const { ui } = useI18n();
  return (
    <fieldset className={classNames(styles.fieldset, className)}>
      <legend className="heading-3">{legend ?? ui.recipes.bindings}</legend>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.slot} className={styles.row}>
            <FormField
              id={`${idPrefix}-${slotToId(item.slot)}`}
              label={
                <span className={styles.label}>
                  {item.label} <span className={classNames('mono', styles.slot)}>{item.slot}</span>
                </span>
              }
              help={item.allowedKindsLabel}
              error={item.error}
              optional={item.optional}
            >
              {item.renderControl}
            </FormField>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
