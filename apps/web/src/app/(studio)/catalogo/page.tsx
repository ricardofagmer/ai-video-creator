import { EmptyState, Icon, buttonClassName, textLinkClassName } from '@studio/ui';
import { PurposeBackfillCountViewSchema, apiPaths, type AssetVersionView } from '@studio/shared/api';
import { AssetIdSchema, parseAssetRef, type AssetKind } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { CatalogFilterBar } from '@/features/catalog/components/CatalogFilterBar';
import { CatalogGroupedGrid, type CatalogGridGroup } from '@/features/catalog/components/CatalogGroupedGrid';
import { CatalogKindTabs } from '@/features/catalog/components/CatalogKindTabs';
import { CatalogLinkBox } from '@/features/catalog/components/CatalogLinkBox';
import { CatalogModeSwitch } from '@/features/catalog/components/CatalogModeSwitch';
import { ImageLinkBox } from '@/features/catalog/components/ImageLinkBox';
import { NewPromptForm, type PromptEditing } from '@/features/catalog/components/NewPromptForm';
import { PurposeBackfillButton } from '@/features/catalog/components/PurposeBackfillButton';
import { PROMPT_EDIT_PARAM, addHrefOf } from '@/features/catalog/catalog-edit-href';
import { listedAssetStatuses } from '@/features/catalog/discontinue-asset';
import { SiteLinkBox } from '@/features/catalog/components/SiteLinkBox';
import { catalogGroupLabel, countCatalogKinds, groupCatalogVersions, type CatalogKindCounts } from '@/features/catalog/catalog-groups';
import {
  catalogFiltersFrom,
  catalogHref,
  hasNonKindFilters,
  representativeVersions,
  type CatalogFilters,
} from '@/features/catalog/catalog-query';
import catalogStyles from '@/features/catalog/catalog.module.css';
import { CATALOG_KIND_PANEL_ID, type CatalogSection, kindsOfSection, onlyKindOfSection, sectionHasCategories, versionInSection } from '@/features/catalog/catalog-sections';
import { kindTabsOf, sectionTabsOf, templateCategoryTabsOf } from '@/features/catalog/catalog-tab-items';
import { IMAGE_CATEGORIES_COOKIE, groupImagesByCategory, imageCategoryLabelOf } from '@/features/catalog/image-categories';
import { sectionCategoryOf } from '@/features/catalog/section-categories';
import { TEMPLATE_CATEGORY_PANEL_ID } from '@/features/catalog/template-categories';
import { videoLinkFrom, type VideoLink } from '@/features/catalog/video-link';
import { SkillsCatalogPanel } from '@/features/skills/components/SkillsCatalogPanel';
import { skillCategoryFrom } from '@/features/skills/skill-categories';
import { SKILL_SEARCH_PARAM, skillSearchFrom } from '@/features/skills/skill-list';
import {
  CUSTOM_CATEGORIES_COOKIE,
  customCategoriesFromCookie,
  customCategoryLabels,
  type CustomCategory,
} from '@/features/catalog/custom-categories';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { CatalogFavoriteCount } from '@/features/favorites/components/CatalogFavoriteCount';
import { FavoritesEmptyState } from '@/features/favorites/components/FavoritesEmptyState';
import { OnlyFavoritesButton } from '@/features/favorites/components/OnlyFavoritesButton';
import { QualityFormulaExplanation } from '@/features/quality/components/QualityFormulaExplanation';
import { SemanticSearchPanel } from '@/features/search/components/SemanticSearchPanel';
import { loadSearchIndexStatus } from '@/features/search/semantic-search-api.server';
import { type AssetSearchParams } from '@/lib/api/client';
import { requestJson } from '@/lib/api';
import { serverStudioClient, serverTransport } from '@/lib/api/server';
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
    // No picked status hides deprecated versions, so a deleted item leaves the list (see `discontinueAsset`).
    statuses: filters.status === null ? listedAssetStatuses : [filters.status],
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
    selectedCategory === null
      ? data.versions
      : data.versions.filter((version) => sectionCategoryOf(filters.section, version) === selectedCategory);
  const filtered = hasNonKindFilters(filters) || selectedCategory !== null;
  // One entry per card: the favorites filter counts and hides cards by their asset id.
  const cardIds = versions.map((version) => version.id);
  const categoryTabs =
    sectionHasCategories(filters.section) && data.versions.length > 0
      ? templateCategoryTabsOf({ filters, items: data.versions, exact: data.nextCursor === null, customLabels, t: t.catalog, locale })
      : null;
  const categoryTabsLabel =
    filters.section === 'references'
      ? t.catalog.tabs.referenceCategoriesLabel
      : filters.section === 'images'
        ? t.catalog.tabs.imageCategoriesLabel
        : t.catalog.tabs.templateCategoriesLabel;
  // Sites hold one subtype only, so a "Sites" heading under the Sites tab would just repeat it.
  // Images sit under one heading per category; a picked category tab already names its only group.
  const groups: CatalogGridGroup[] =
    filters.section === 'sites'
      ? [{ id: 'catalogo-grupo-sites', label: null, versions }]
      : filters.section === 'images'
        ? groupImagesByCategory(versions).map((group) => ({
            id: `catalogo-grupo-imagem-${group.category.replace('.', '-')}`,
            label: selectedCategory === null ? imageCategoryLabelOf(group.category, t.catalog.categories.imageCategories, customLabels) : null,
            versions: group.versions,
          }))
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
          // Images read as a picture library: small tiles under their `cat.*` category tag, No category last.
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
        trailing={
          <>
            <CatalogModeSwitch filters={filters} />
            <OnlyFavoritesButton scope="catalog" ids={cardIds} />
          </>
        }
      />
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
  const [indexStatus, lexical, translations, cookieStore, purposeMissing] = await Promise.all([
    meaning ? loadSearchIndexStatus() : null,
    meaning ? null : loadLexicalCatalog(filters),
    getI18n(),
    cookies(),
    loadPurposeMissing(),
  ]);
  // The category names this browser created (custom-categories.ts), so tabs and the save form show them as typed.
  const customCategories: readonly CustomCategory[] = customCategoriesFromCookie(cookieStore.get(CUSTOM_CATEGORIES_COOKIE)?.value);
  const imageCustomCategories: readonly CustomCategory[] = customCategoriesFromCookie(cookieStore.get(IMAGE_CATEGORIES_COOKIE)?.value);
  const sectionCustomCategories = filters.section === 'images' ? imageCustomCategories : customCategories;
  const { t, locale } = translations;
  const counts = lexical?.counts ?? null;
  const tabTexts = { t: t.catalog, locale };
  const kindTabs = kindTabsOf(filters, counts, tabTexts);
  const link: VideoLink =
    filters.section === 'references' && typeof parameters.link === 'string' ? videoLinkFrom(parameters.link) : { status: 'absent' };
  const saved = parameters.salvo;
  const savedAssetId = typeof saved === 'string' && AssetIdSchema.safeParse(saved).success ? saved : null;
  const editing = filters.section === 'prompts' ? await loadPromptEditing(parameters[PROMPT_EDIT_PARAM]) : null;
  // Sections without their own add box get one button per kind they hold, or only the open kind tab's.
  // The Skills tab is the skills page itself (category tabs, Import and New skill), not the generic grid.
  const skillsTab = !meaning && filters.section === 'ai-writing' && filters.kind === 'skill';
  const addKinds: readonly AssetKind[] = skillsTab || SECTIONS_WITH_OWN_ADD_BOX.has(filters.section)
    ? []
    : filters.kind === null
      ? kindsOfSection(filters.section)
      : [filters.kind];

  // Each mode puts the mode switch right under its own search input.
  const content = skillsTab ? (
    <SkillsCatalogPanel
      category={skillCategoryFrom(typeof parameters.categoria === 'string' ? parameters.categoria : undefined)}
      savedAssetId={savedAssetId}
      search={skillSearchFrom(parameters[SKILL_SEARCH_PARAM])}
    />
  ) : lexical === null ? (
      <SemanticSearchPanel
        status={indexStatus}
        kinds={queryKindsOf(filters)}
        section={filters.section}
        assetStatus={filters.status}
        modeSwitch={<CatalogModeSwitch filters={filters} />}
      />
    ) : (
      <LexicalCatalog filters={filters} data={lexical} customLabels={customCategoryLabels(sectionCustomCategories)} />
    );

  return (
    <div className={layout.page}>
      <StudioHero
        eyebrow={t.common.heroEyebrows.catalog}
        glyph="reel"
        title={t.catalog.list.title}
        description={t.catalog.list.description}
        actions={
          <>
            {purposeMissing !== null && <PurposeBackfillButton missing={purposeMissing} />}
            <Link href="/catalogo/novo" className={buttonClassName({ variant: 'primary' })}>
              {t.catalog.list.uploadAsset}
            </Link>
          </>
        }
      />
      <CatalogKindTabs label={t.catalog.sections.label} tabs={sectionTabsOf(filters, counts, tabTexts)}>
        {filters.section === 'references' && <CatalogLinkBox link={link} savedAssetId={savedAssetId} customCategories={customCategories} t={t.catalog.linkBox} />}
        {filters.section === 'sites' && <SiteLinkBox savedAssetId={savedAssetId} />}
        {filters.section === 'images' && <ImageLinkBox savedAssetId={savedAssetId} initialCustomCategories={imageCustomCategories} />}
        {filters.section === 'prompts' && <NewPromptForm key={editing === null ? 'new' : editing.ref} savedAssetId={savedAssetId} editing={editing} />}
        {addKinds.length > 0 && (
          <div className={catalogStyles.sectionAddBar}>
            {addKinds.map((kind) => (
              <Link key={kind} href={addHrefOf(kind)} className={buttonClassName({ variant: 'secondary' })}>
                <Icon name="plus" size="sm" />
                <span>{t.catalog.list.addKind(t.catalog.kinds[kind])}</span>
              </Link>
            ))}
          </div>
        )}
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

/** Sections whose own box already adds their kind (references, sites, images, prompts). */
const SECTIONS_WITH_OWN_ADD_BOX: ReadonlySet<CatalogSection> = new Set<CatalogSection>(['references', 'sites', 'images', 'prompts']);

/**
 * `GET purposes/backfill` (ADR 0012 decision 9, AP-13): versions still without a purpose. The
 * button is an extra, so a failed count leaves the catalog as it is and only hides the button; an
 * expired session is the catalog search's own redirect.
 */
async function loadPurposeMissing(): Promise<number | null> {
  try {
    const view = await requestJson(serverTransport('throw'), { method: 'GET', path: apiPaths.purposeBackfill() }, PurposeBackfillCountViewSchema);
    return view.missing;
  } catch {
    return null;
  }
}

/**
 * `?editar=<assetId>@<version>` on the Prompts section: the prompt version and its stored text, so the form opens
 * filled in. The value is untrusted, so it is parsed; a bad ref or a failed load answers `unavailable`.
 */
async function loadPromptEditing(raw: string | string[] | undefined): Promise<PromptEditing | null> {
  if (typeof raw !== 'string') return null;
  let ref: { assetId: string; version: number };
  try {
    ref = parseAssetRef(raw);
  } catch {
    return { status: 'unavailable', ref: raw };
  }
  try {
    const client = serverStudioClient();
    const [version, entry] = await Promise.all([client.getAssetVersion(ref.assetId, ref.version), client.readEntryFile(ref.assetId, ref.version)]);
    if (version.kind !== 'prompt') return { status: 'unavailable', ref: raw };
    return { status: 'ready', ref: raw, version, text: entry.text };
  } catch {
    return { status: 'unavailable', ref: raw };
  }
}
