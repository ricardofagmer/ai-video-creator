'use client';

import { Label, SearchField, Select, useI18n, type Locale, type SelectOption } from '@studio/ui';
import { AssetStatusSchema } from '@studio/shared/catalog';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatScoreValue } from '@/features/quality/quality-labels';
import { type WebMessages } from '@/messages';
import { useWebMessages } from '@/lib/i18n/client';
import { catalogHref, minQualityChoices, minSampleSizeChoices, type CatalogFilters } from '../catalog-query';
import { DEFAULT_CATALOG_SECTION, catalogSectionSlug } from '../catalog-sections';
import styles from '../catalog.module.css';

interface FilterOptions {
  status: SelectOption[];
  sort: SelectOption[];
  minQuality: SelectOption[];
  minSampleSize: SelectOption[];
}

function filterOptionsOf(t: WebMessages['catalog'], assetStatus: Readonly<Record<string, string>>, locale: Locale): FilterOptions {
  const { filters } = t;
  return {
    status: [
      { value: '', label: filters.all },
      ...AssetStatusSchema.options.map((status) => ({ value: status, label: assetStatus[status] ?? status })),
    ],
    sort: [
      { value: '', label: filters.sortRecent },
      { value: 'nota', label: filters.sortQuality },
    ],
    minQuality: [
      { value: '', label: filters.any },
      ...minQualityChoices.map((choice) => ({ value: String(choice), label: filters.orMore(formatScoreValue(choice, locale)) })),
    ],
    minSampleSize: [
      { value: '', label: filters.any },
      ...minSampleSizeChoices.map((choice) => ({ value: String(choice), label: filters.orMore(String(choice)) })),
    ],
  };
}

function choiceOf(value: string, choices: readonly number[]): number | null {
  const number = Number.parseFloat(value);
  return choices.includes(number) ? number : null;
}

/**
 * design/telas/02 filter bar, plus the rev 3 score sort and filters (SPEC 0003 section 4.3). Filters
 * live in the URL, not in client state shared elsewhere; the form also works as a plain GET form
 * before hydration.
 */
interface CatalogFilterBarProps {
  filters: CatalogFilters;
  /** Drawn at the end of the same row (the Only favourites toggle); it must not submit the form. */
  trailing?: ReactNode;
  /** Given by a screen that keeps the filters in its own state (a dialog): the bar then never touches the URL. */
  onFiltersChange?: (filters: CatalogFilters) => void;
}

export function CatalogFilterBar({ filters, trailing, onFiltersChange }: CatalogFilterBarProps): ReactElement {
  const router = useRouter();
  const t = useWebMessages();
  const { ui, locale } = useI18n();
  const options = useMemo(() => filterOptionsOf(t.catalog, ui.status.asset, locale), [t, ui, locale]);
  const labels = t.catalog.filters;
  const [text, setText] = useState(filters.text);

  function navigate(next: Partial<CatalogFilters>): void {
    const changed: CatalogFilters = { ...filters, ...next, mode: 'words', cursor: null };
    if (onFiltersChange !== undefined) onFiltersChange(changed);
    else router.replace(catalogHref(changed));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    navigate({ text: text.trim() });
  }

  return (
    <form method="get" action="/catalogo" className={`${layout.row} ${styles.filterBar}`} onSubmit={handleSubmit}>
      <SearchField
        id="busca-catalogo"
        name="q"
        label={labels.searchLabel}
        placeholder={labels.searchPlaceholder}
        maxLength={200}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      {/* The section and kind tabs own `?secao=` and `?tipo=`; the plain GET form keeps the open tabs. */}
      {filters.kind !== null && <input type="hidden" name="tipo" value={filters.kind} />}
      {filters.kind === null && filters.section !== DEFAULT_CATALOG_SECTION && (
        <input type="hidden" name="secao" value={catalogSectionSlug(filters.section)} />
      )}
      <div className={layout.field}>
        <Label htmlFor="filtro-status">{labels.status}</Label>
        <Select
          id="filtro-status"
          name="status"
          options={options.status}
          value={filters.status ?? ''}
          onChange={(event) => {
            const status = AssetStatusSchema.safeParse(event.currentTarget.value);
            navigate({ status: status.success ? status.data : null });
          }}
        />
      </div>
      <div className={layout.field}>
        <Label htmlFor="filtro-ordem">{labels.sortBy}</Label>
        <Select
          id="filtro-ordem"
          name="ordem"
          options={options.sort}
          value={filters.sort === 'quality' ? 'nota' : ''}
          onChange={(event) => navigate({ sort: event.currentTarget.value === 'nota' ? 'quality' : 'recent' })}
        />
      </div>
      <div className={layout.field}>
        <Label htmlFor="filtro-nota-min">{labels.minQuality}</Label>
        <Select
          id="filtro-nota-min"
          name="nota-min"
          options={options.minQuality}
          value={filters.minQuality === null ? '' : String(filters.minQuality)}
          onChange={(event) => navigate({ minQuality: choiceOf(event.currentTarget.value, minQualityChoices) })}
        />
      </div>
      <div className={layout.field}>
        <Label htmlFor="filtro-execucoes-min">{labels.minSampleSize}</Label>
        <Select
          id="filtro-execucoes-min"
          name="execucoes-min"
          options={options.minSampleSize}
          value={filters.minSampleSize === null ? '' : String(filters.minSampleSize)}
          onChange={(event) => navigate({ minSampleSize: choiceOf(event.currentTarget.value, minSampleSizeChoices) })}
        />
      </div>
      {trailing}
    </form>
  );
}
