'use client';

import { Card, Checkbox } from '@studio/ui';
import { type ChecklistItem } from '@studio/shared/recipes';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';

export interface RecipeChecklistSectionProps {
  items: readonly ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

/** design/telas/06 card "Checklist da revisão": one "Obrigatório" Checkbox per item (D14). */
export function RecipeChecklistSection({ items, onChange }: RecipeChecklistSectionProps): ReactElement {
  const texts = useWebMessages().recipes.checklist;
  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title} description={texts.itemCount(items.length)}>
        <ul className={`${layout.selectedFiles} ${layout.stack}`}>
          {items.map((item) => (
            <li key={item.id} className={layout.field}>
              <span className="body-sm">{item.label}</span>
              <Checkbox
                id={`checklist-${item.id}`}
                label={
                  <>
                    {texts.required}
                    <span className="visually-hidden">: {item.label}</span>
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
