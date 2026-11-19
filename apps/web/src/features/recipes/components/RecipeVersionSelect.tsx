import { Button, Label, Select } from '@studio/ui';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';

export interface RecipeVersionSelectProps {
  recipeId: string;
  current: number;
  versions: readonly { version: number; label: string }[];
}

/**
 * design/telas/06 header: compact "Versões" select that opens `?versao=N`. A GET form with an
 * explicit button, so moving through the options with the keyboard never navigates by itself.
 */
export function RecipeVersionSelect({ recipeId, current, versions }: RecipeVersionSelectProps): ReactElement {
  return (
    <form method="get" action={`/receitas/${recipeId}`} className={layout.row}>
      <div className={layout.field}>
        <Label htmlFor="versoes-receita">Versões</Label>
        <Select
          key={current}
          id="versoes-receita"
          name="versao"
          options={versions.map((entry) => ({ value: String(entry.version), label: entry.label }))}
          defaultValue={String(current)}
        />
      </div>
      <Button type="submit" variant="ghost">
        Abrir
      </Button>
    </form>
  );
}
