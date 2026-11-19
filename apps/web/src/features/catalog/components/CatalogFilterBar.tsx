'use client';

import { Label, SearchField, Select, type SelectOption } from '@studio/ui';
import { AssetKindSchema, AssetStatusSchema, assetKinds } from '@studio/shared/catalog';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatScoreValue } from '@/features/quality/quality-labels';
import { assetKindLabels, assetStatusLabels } from '../catalog-labels';
import { catalogHref, minQualityChoices, minSampleSizeChoices, type CatalogFilters } from '../catalog-query';

const kindOptions: SelectOption[] = [{ value: '', label: 'Todos' }, ...assetKinds.map((kind) => ({ value: kind, label: assetKindLabels[kind] }))];
const statusOptions: SelectOption[] = [
  { value: '', label: 'Todos' },
  ...AssetStatusSchema.options.map((status) => ({ value: status, label: assetStatusLabels[status] })),
];
const sortOptions: SelectOption[] = [
  { value: '', label: 'Mais recentes' },
  { value: 'nota', label: 'Maior nota' },
];
const minQualityOptions: SelectOption[] = [
  { value: '', label: 'Qualquer' },
  ...minQualityChoices.map((choice) => ({ value: String(choice), label: `${formatScoreValue(choice)} ou mais` })),
];
const minSampleSizeOptions: SelectOption[] = [
  { value: '', label: 'Qualquer' },
  ...minSampleSizeChoices.map((choice) => ({ value: String(choice), label: `${choice} ou mais` })),
];

function choiceOf(value: string, choices: readonly number[]): number | null {
  const number = Number.parseFloat(value);
  return choices.includes(number) ? number : null;
}

/**
 * design/telas/02 filter bar, plus the rev 3 score sort and filters (SPEC 0003 section 4.3). Filters
 * live in the URL, not in client state shared elsewhere; the form also works as a plain GET form
 * before hydration.
 */
export function CatalogFilterBar({ filters }: { filters: CatalogFilters }): ReactElement {
  const router = useRouter();
  const [text, setText] = useState(filters.text);

  function navigate(next: Partial<CatalogFilters>): void {
    router.replace(catalogHref({ ...filters, ...next, mode: 'words', cursor: null }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    navigate({ text: text.trim() });
  }

  return (
    <form method="get" action="/catalogo" className={layout.row} onSubmit={handleSubmit}>
      <SearchField
        id="busca-catalogo"
        name="q"
        label="Buscar no catálogo"
        placeholder="Buscar por nome, etiqueta ou nota"
        maxLength={200}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <div className={layout.field}>
        <Label htmlFor="filtro-tipo">Tipo</Label>
        <Select
          id="filtro-tipo"
          name="tipo"
          options={kindOptions}
          value={filters.kind ?? ''}
          onChange={(event) => {
            const kind = AssetKindSchema.safeParse(event.currentTarget.value);
            navigate({ kind: kind.success ? kind.data : null });
          }}
        />
      </div>
      <div className={layout.field}>
        <Label htmlFor="filtro-status">Status</Label>
        <Select
          id="filtro-status"
          name="status"
          options={statusOptions}
          value={filters.status ?? ''}
          onChange={(event) => {
            const status = AssetStatusSchema.safeParse(event.currentTarget.value);
            navigate({ status: status.success ? status.data : null });
          }}
        />
      </div>
      <div className={layout.field}>
        <Label htmlFor="filtro-ordem">Ordenar por</Label>
        <Select
          id="filtro-ordem"
          name="ordem"
          options={sortOptions}
          value={filters.sort === 'quality' ? 'nota' : ''}
          onChange={(event) => navigate({ sort: event.currentTarget.value === 'nota' ? 'quality' : 'recent' })}
        />
      </div>
      <div className={layout.field}>
        <Label htmlFor="filtro-nota-min">Nota mínima</Label>
        <Select
          id="filtro-nota-min"
          name="nota-min"
          options={minQualityOptions}
          value={filters.minQuality === null ? '' : String(filters.minQuality)}
          onChange={(event) => navigate({ minQuality: choiceOf(event.currentTarget.value, minQualityChoices) })}
        />
      </div>
      <div className={layout.field}>
        <Label htmlFor="filtro-execucoes-min">Execuções revisadas</Label>
        <Select
          id="filtro-execucoes-min"
          name="execucoes-min"
          options={minSampleSizeOptions}
          value={filters.minSampleSize === null ? '' : String(filters.minSampleSize)}
          onChange={(event) => navigate({ minSampleSize: choiceOf(event.currentTarget.value, minSampleSizeChoices) })}
        />
      </div>
    </form>
  );
}
