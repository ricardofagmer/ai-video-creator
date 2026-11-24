import { EmptyState, PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { AssetIdSchema, type AssetKind } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { CatalogFilterBar } from '@/features/catalog/components/CatalogFilterBar';
import { CatalogGroupedGrid, type CatalogGridGroup } from '@/features/catalog/components/CatalogGroupedGrid';
import { CatalogKindTabs } from '@/features/catalog/components/CatalogKindTabs';
import { CatalogLinkBox } from '@/features/catalog/components/CatalogLinkBox';
import { CatalogModeSwitch } from '@/features/catalog/components/CatalogModeSwitch';
import { ImageLinkBox } from '@/features/catalog/components/ImageLinkBox';
import { NewPromptForm } from '@/features/catalog/components/NewPromptForm';
import { SiteLinkBox } from '@/features/catalog/components/SiteLinkBox';
import { catalogGroupLabel, countCatalogKinds, groupCatalogVersions, type CatalogKindCounts } from '@/features/catalog/catalog-groups';
import {
  catalogFiltersFrom,
  catalogHref,
  hasNonKindFilters,
  representativeVersions,
  type CatalogFilters,
} from '@/features/catalog/catalog-query';
import { CATALOG_KIND_PANEL_ID, kindsOfSection, onlyKindOfSection, sectionHasCategories, versionInSection } from '@/features/catalog/catalog-sections';
import { kindTabsOf, sectionTabsOf, templateCategoryTabsOf } from '@/features/catalog/catalog-tab-items';
import { TEMPLATE_CATEGORY_PANEL_ID, templateCategoryOf } from '@/features/catalog/template-categories';
import { videoLinkFrom, type VideoLink } from '@/features/catalog/video-link';
import {
  CUSTOM_CATEGORIES_COOKIE,
  customCategoriesFromCookie,
  customCategoryLabels,
  type CustomCategory,
} from '@/features/catalog/custom-categories';
import layout from '@/features/common/layout.module.css';
import { CatalogFavoriteCount } from '@/features/favorites/components/CatalogFavoriteCount';
import { FavoritesEmptyState } from '@/features/favorites/components/FavoritesEmptyState';
import { OnlyFavoritesButton } from '@/features/favorites/components/OnlyFavoritesButton';
import { QualityFormulaExplanation } from '@/features/quality/components/QualityFormulaExplanation';
import { SemanticSearchPanel } from '@/features/search/components/SemanticSearchPanel';
import { loadSearchIndexStatus } from '@/features/search/semantic-search-api.server';
import { type AssetSearchParams } from '@/lib/api/client';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.catalog.list.title };
}

interface CatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface LexicalCatalogData {
  versions: AssetVersionView[];
  byScore: boolean;
  nextCursor: string | null;
  /** Cards per kind under the other filters; null when they do not fit in one page and would be wrong. */
  counts: CatalogKindCounts | null;
}

/** The kinds a query covers: the picked kind, or every kind of the open section. */
function queryKindsOf(filters: CatalogFilters): readonly AssetKind[] {
  return filters.kind === null ? kindsOfSection(filters.section) : [filters.kind];
}

/**
 * Lexical list (design/telas/02) with the rev 3 score sort and filters (SPEC 0003 section 4.3). The
 * section and kind tab counts need the list of every kind without the cursor, asked for in parallel.
 */
async function loadLexicalCatalog(filters: CatalogFilters): Promise<LexicalCatalogData> {
  const client = serverStudioClient();
  const query: AssetSearchParams = {
    text: filters.text === '' ? undefined : filters.text,
    statuses: filters.status === null ? undefined : [filters.status],
    // The owner's view lists biometric rows too, by path and hash only (PRD 12).
    sensitivity: 'any',
    sort: filters.sort === 'quality' ? 'quality' : undefined,
    minQuality: filters.minQuality ?? undefined,
    minSampleSize: filters.minSampleSize ?? undefined,
    limit: 100,
  };
  const [page, countingPage] = await Promise.all([
    client.searchAssets({ ...query, kinds: [...queryKindsOf(filters)], cursor: filters.cursor ?? undefined }),
    client.searchAssets(query),
  ]);
  // Sorted by score each version is its own card (the score belongs to a version, not an asset).
  const byScore = filters.sort === 'quality';
  const fold = (items: readonly AssetVersionView[]): AssetVersionView[] => (byScore ? [...items] : representativeVersions(items));
  return {
    // References and Sites share the `reference` kind; the search cannot filter the subtype, so it is split here.
    versions: fold(page.items).filter((version) => versionInSection(filters.section, version)),
    byScore,
    nextCursor: page.nextCursor,
    counts: countingPage.nextCursor === null ? countCatalogKinds(fold(countingPage.items)) : null,
  };
}

async function LexicalCatalog({
  filters,
  data,
  customLabels,
}: {
  filters: CatalogFilters;
  data: LexicalCatalogData;
  customLabels: ReadonlyMap<string, string>;
}) {
  const { t, locale } = await getI18n();
  const { byScore } = data;
  // A one-kind section groups by its kind's subtype (video, image… or aspect ratio), like a kind tab.
  const groupTab = filters.kind ?? onlyKindOfSection(filters.section);
  const selectedCategory = filters.templateCategory;
  const versions =
    selectedCategory === null ? data.versions : data.versions.filter((version) => templateCategoryOf(version) === selectedCategory);
  const filtered = hasNonKindFilters(filters) || selectedCategory !== null;
  // One entry per card: the favorites filter counts and hides cards by their asset id.
  const cardIds = versions.map((version) => version.id);
  const categoryTabs =
    sectionHasCategories(filters.section) && data.versions.length > 0
      ? templateCategoryTabsOf({ filters, items: data.versions, exact: data.nextCursor === null, customLabels, t: t.catalog, locale })
      : null;
  const categoryTabsLabel = filters.section === 'references' ? t.catalog.tabs.referenceCategoriesLabel : t.catalog.tabs.templateCategoriesLabel;
  // Sites hold one subtype only, so a "Sites" heading under the Sites tab would just repeat it.
  const groups: CatalogGridGroup[] =
    filters.section === 'sites'
      ? [{ id: 'catalogo-grupo-sites', label: null, versions }]
      : groupCatalogVersions(versions, groupTab).map((group) => ({
          id: group.id,
          label: catalogGroupLabel(group, groupTab, t.catalog),
          versions: group.versions,
        }));
  const catalogEmpty = data.counts !== null && data.counts.total === 0;

  const results = (
    <>
      <CatalogFavoriteCount ids={cardIds} byScore={byScore} live />
      {versions.length === 0 && !filtered && !catalogEmpty && (
        <EmptyState
          title={t.catalog.list.kindEmptyTitle}
          description={t.catalog.list.kindEmptyDescription}
          action={
            <Link href="/catalogo/novo" className={buttonClassName({ variant: 'primary' })}>
              {t.catalog.list.uploadAsset}
            </Link>
          }
        />
      )}
      {versions.length === 0 && !filtered && catalogEmpty && (
        <EmptyState
          title={t.catalog.list.emptyTitle}
          description={
            <>
              {t.catalog.list.emptyDescriptionBefore}
              <code>studio catalog seed</code>
              {t.catalog.list.emptyDescriptionAfter}
            </>
          }
          action={
            <Link href="/catalogo/novo" className={buttonClassName({ variant: 'primary' })}>
              {t.catalog.list.uploadAsset}
            </Link>
          }
        />
      )}
      {versions.length === 0 && filtered && (
        <EmptyState
          title={t.catalog.list.noResultsTitle}
          description={t.catalog.list.noResultsDescription}
          action={
            <Link href={catalogHref({ section: filters.section, kind: filters.kind })} className={buttonClassName({ variant: 'secondary' })}>
              {t.catalog.list.clearFilters}
            </Link>
          }
        />
      )}
      <FavoritesEmptyState scope="catalog" ids={cardIds} />
      {versions.length > 0 && (
        <CatalogGroupedGrid
          groups={groups}
          byScore={byScore}
          t={t.catalog}
          locale={locale}
          // Images read as a picture library: small tiles under their category (logo, still, background…).
          appearance={filters.section === 'images' ? 'library' : 'cards'}
        />
      )}
      {data.nextCursor !== null && (
        <p>
          <Link href={catalogHref({ ...filters, cursor: data.nextCursor })} className={textLinkClassName()}>
            {t.catalog.list.nextPage}
          </Link>
        </p>
      )}
    </>
  );

  return (
    <>
      <CatalogFilterBar
        key={`${filters.text}|${filters.section}|${filters.kind ?? ''}|${filters.status ?? ''}|${filters.sort}|${filters.minQuality ?? ''}|${filters.minSampleSize ?? ''}`}
        filters={filters}
      />
      <div className={layout.row}>
        <OnlyFavoritesButton scope="catalog" ids={cardIds} />
      </div>
      <CatalogModeSwitch filters={filters} />
      <QualityFormulaExplanation />
      {categoryTabs !== null ? (
        <CatalogKindTabs label={categoryTabsLabel} tabs={categoryTabs} panelId={TEMPLATE_CATEGORY_PANEL_ID} appearance="segmented">
          {results}
        </CatalogKindTabs>
      ) : (
        results
      )}
    </>
  );
}

/**
 * design/telas/02: `/catalogo`, search by words (filters in the URL) or by meaning (rev 3), in its
 * sections with References first (docs/specs/2026-11-23-catalog-sections-and-link-embed-design.md).
 */
export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const parameters = await searchParams;
  const filters = catalogFiltersFrom(parameters);
  const meaning = filters.mode === 'meaning';
  const [indexStatus, lexical, translations, cookieStore] = await Promise.all([
    meaning ? loadSearchIndexStatus() : null,
    meaning ? null : loadLexicalCatalog(filters),
    getI18n(),
    cookies(),
  ]);
  // The category names this browser created (custom-categories.ts), so tabs and the save form show them as typed.
  const customCategories: readonly CustomCategory[] = customCategoriesFromCookie(cookieStore.get(CUSTOM_CATEGORIES_COOKIE)?.value);
  const { t, locale } = translations;
  const counts = lexical?.counts ?? null;
  const tabTexts = { t: t.catalog, locale };
  const kindTabs = kindTabsOf(filters, counts, tabTexts);
  const link: VideoLink =
    filters.section === 'references' && typeof parameters.link === 'string' ? videoLinkFrom(parameters.link) : { status: 'absent' };
  const saved = parameters.salvo;
  const savedAssetId = typeof saved === 'string' && AssetIdSchema.safeParse(saved).success ? saved : null;

  // Each mode puts the mode switch right under its own search input.
  const content =
    lexical === null ? (
      <SemanticSearchPanel
        status={indexStatus}
        kinds={queryKindsOf(filters)}
        section={filters.section}
        assetStatus={filters.status}
        modeSwitch={<CatalogModeSwitch filters={filters} />}
      />
    ) : (
      <LexicalCatalog filters={filters} data={lexical} customLabels={customCategoryLabels(customCategories)} />
    );

  return (
    <div className={layout.page}>
      <PageHeader
        title={t.catalog.list.title}
        description={t.catalog.list.description}
        actions={
          <Link href="/catalogo/novo" className={buttonClassName({ variant: 'primary' })}>
            {t.catalog.list.uploadAsset}
          </Link>
        }
      />
      <CatalogKindTabs label={t.catalog.sections.label} tabs={sectionTabsOf(filters, counts, tabTexts)}>
        {filters.section === 'references' && <CatalogLinkBox link={link} savedAssetId={savedAssetId} customCategories={customCategories} t={t.catalog.linkBox} />}
        {filters.section === 'sites' && <SiteLinkBox savedAssetId={savedAssetId} />}
        {filters.section === 'images' && <ImageLinkBox savedAssetId={savedAssetId} />}
        {filters.section === 'prompts' && <NewPromptForm savedAssetId={savedAssetId} />}
        {kindTabs === null ? (
          content
        ) : (
          <CatalogKindTabs label={t.catalog.sections.kindsLabel} tabs={kindTabs} panelId={CATALOG_KIND_PANEL_ID} appearance="segmented">
            {content}
          </CatalogKindTabs>
        )}
      </CatalogKindTabs>
    </div>
  );
}
