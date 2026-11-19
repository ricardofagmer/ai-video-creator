import { EmptyState, PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CatalogAssetItem } from '@/features/catalog/components/CatalogAssetItem';
import { CatalogFilterBar } from '@/features/catalog/components/CatalogFilterBar';
import { CatalogModeSwitch } from '@/features/catalog/components/CatalogModeSwitch';
import { catalogFiltersFrom, catalogHref, hasActiveFilters, representativeVersions, type CatalogFilters } from '@/features/catalog/catalog-query';
import layout from '@/features/common/layout.module.css';
import { QualityFormulaExplanation } from '@/features/quality/components/QualityFormulaExplanation';
import { SemanticSearchPanel } from '@/features/search/components/SemanticSearchPanel';
import { loadSearchIndexStatus } from '@/features/search/semantic-search-api.server';
import { serverStudioClient } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Catálogo' };

interface CatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Lexical list (design/telas/02) with the rev 3 score sort and filters (SPEC 0003 section 4.3). */
async function LexicalCatalog({ filters }: { filters: CatalogFilters }) {
  const page = await serverStudioClient().searchAssets({
    text: filters.text === '' ? undefined : filters.text,
    kinds: filters.kind === null ? undefined : [filters.kind],
    statuses: filters.status === null ? undefined : [filters.status],
    // The owner's view lists biometric rows too, by path and hash only (PRD 12).
    sensitivity: 'any',
    sort: filters.sort === 'quality' ? 'quality' : undefined,
    minQuality: filters.minQuality ?? undefined,
    minSampleSize: filters.minSampleSize ?? undefined,
    limit: 100,
    cursor: filters.cursor ?? undefined,
  });
  // Sorted by score each version is its own card (the score belongs to a version, not an asset).
  const byScore = filters.sort === 'quality';
  const versions = byScore ? page.items : representativeVersions(page.items);
  const filtered = hasActiveFilters(filters);
  const countText = byScore ? (versions.length === 1 ? '1 versão' : `${versions.length} versões`) : versions.length === 1 ? '1 ativo' : `${versions.length} ativos`;

  return (
    <>
      <CatalogFilterBar
        key={`${filters.text}|${filters.kind ?? ''}|${filters.status ?? ''}|${filters.sort}|${filters.minQuality ?? ''}|${filters.minSampleSize ?? ''}`}
        filters={filters}
      />
      <QualityFormulaExplanation />
      <p className="caption" aria-live="polite">
        {countText}
      </p>
      {versions.length === 0 && !filtered && (
        <EmptyState
          title="O catálogo está vazio"
          description={
            <>
              Envie um arquivo ou rode <code>studio catalog seed</code> para importar os ativos do ai-creator-engine.
            </>
          }
          action={
            <Link href="/catalogo/novo" className={buttonClassName({ variant: 'primary' })}>
              Enviar ativo
            </Link>
          }
        />
      )}
      {versions.length === 0 && filtered && (
        <EmptyState
          title="Nenhum ativo encontrado"
          description="Tente outro termo ou limpe os filtros. Versões sem nota não entram no filtro de nota mínima."
          action={
            <Link href="/catalogo" className={buttonClassName({ variant: 'secondary' })}>
              Limpar filtros
            </Link>
          }
        />
      )}
      {versions.length > 0 && (
        <ul className={layout.cardGrid}>
          {versions.map((version) => (
            <li key={`${version.id}@${version.version}`}>
              <CatalogAssetItem version={version} linkToVersion={byScore} />
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor !== null && (
        <p>
          <Link href={catalogHref({ ...filters, cursor: page.nextCursor })} className={textLinkClassName()}>
            Próxima página
          </Link>
        </p>
      )}
    </>
  );
}

/** design/telas/02: `/catalogo`, search by words (filters in the URL) or by meaning (rev 3). */
export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const filters = catalogFiltersFrom(await searchParams);
  const indexStatus = filters.mode === 'meaning' ? await loadSearchIndexStatus() : null;

  return (
    <div className={layout.page}>
      <PageHeader
        title="Catálogo"
        description="Templates, modelos, prompts, mídias e kits de marca usados nas receitas."
        actions={
          <Link href="/catalogo/novo" className={buttonClassName({ variant: 'primary' })}>
            Enviar ativo
          </Link>
        }
      />
      <CatalogModeSwitch filters={filters} />
      {filters.mode === 'meaning' ? (
        <SemanticSearchPanel status={indexStatus} kind={filters.kind} assetStatus={filters.status} />
      ) : (
        <LexicalCatalog filters={filters} />
      )}
    </div>
  );
}
