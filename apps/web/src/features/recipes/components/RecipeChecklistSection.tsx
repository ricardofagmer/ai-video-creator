'use client';

import { Card, Checkbox } from '@studio/ui';
import { type ChecklistItem } from '@studio/shared/recipes';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';

export interface RecipeChecklistSectionProps {
  items: readonly ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

/** design/telas/06 card "Checklist da revisão": one "Obrigatório" Checkbox per item (D14). */
export function RecipeChecklistSection({ items, onChange }: RecipeChecklistSectionProps): ReactElement {
  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">Checklist da revisão</legend>
      <Card title="Checklist da revisão" description={`${items.length} itens`}>
        <ul className={`${layout.selectedFiles} ${layout.stack}`}>
          {items.map((item) => (
            <li key={item.id} className={layout.field}>
              <span className="body-sm">{item.label}</span>
              <Checkbox
                id={`checklist-${item.id}`}
                label={
                  <>
                    Obrigatório<span className="visually-hidden">: {item.label}</span>
                  </>
                }
                checked={item.required}
                onChange={(event) => {
                  const required = event.currentTarget.checked;
                  onChange(items.map((candidate) => (candidate.id === item.id ? { ...candidate, required } : candidate)));
                }}
              />
            </li>
          ))}
        </ul>
      </Card>
    </fieldset>
  );
}
