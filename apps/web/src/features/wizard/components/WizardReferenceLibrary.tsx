'use client';

import { Alert, Badge, Button, EmptyState, Input, Label, Spinner, classNames, useI18n } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { catalogGroupLabel, groupCatalogVersions } from '@/features/catalog/catalog-groups';
import { representativeVersions, type CatalogFilters } from '@/features/catalog/catalog-query';
import { kindsOfSection, onlyKindOfSection, versionInSection } from '@/features/catalog/catalog-sections';
import catalogStyles from '@/features/catalog/catalog.module.css';
import { CatalogFilterBar } from '@/features/catalog/components/CatalogFilterBar';
import { SaveReferenceLinkForm } from '@/features/catalog/components/SaveReferenceLinkForm';
import { VideoEmbed } from '@/features/catalog/components/VideoEmbed';
import { listedAssetStatuses } from '@/features/catalog/discontinue-asset';
import { CUSTOM_CATEGORIES_COOKIE, customCategoriesFromCookie, customCategoryLabels, type CustomCategory } from '@/features/catalog/custom-categories';
import { categoryLabelOf, countTemplateCategories, templateCategoryOf, type CatalogCategory } from '@/features/catalog/template-categories';
import { videoLinkFrom, videoPostKey, type VideoLink } from '@/features/catalog/video-link';
import layout from '@/features/common/layout.module.css';
import { QualityFormulaExplanation } from '@/features/quality/components/QualityFormulaExplanation';
import { MAX_RUN_REFERENCES } from '@/features/runs/components/RunReferencesPicker';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { WizardLibraryCard } from './WizardLibraryCard';

const LINK_INPUT_ID = 'assistente-referencia-link';
const SECTION = 'references';
const initialFilters: CatalogFilters = {
  mode: 'words',
  text: '',
  section: SECTION,
  kind: null,
  templateCategory: null,
  status: null,
  sort: 'recent',
  minQuality: null,
  minSampleSize: null,
  cursor: null,
};

type ListState =
  | { status: 'loading' }
  | { status: 'done'; versions: readonly AssetVersionView[] }
  | { status: 'failed'; message: string };

/** The category names this browser created, read from the cookie the catalog writes. */
function storedCustomCategories(): CustomCategory[] {
  const pair = document.cookie.split('; ').find((entry) => entry.startsWith(`${CUSTOM_CATEGORIES_COOKIE}=`));
  if (pair === undefined) return [];
  try {
    return customCategoriesFromCookie(decodeURIComponent(pair.slice(CUSTOM_CATEGORIES_COOKIE.length + 1)));
  } catch {
    return [];
  }
}

interface WizardReferenceLibraryProps {
  selected: readonly string[];
  onChange: (refs: string[]) => void;
}

/**
 * The catalog's References screen inside the wizard dialog: the link box, the filter bar, the
 * category tabs and the cards. The catalog page keeps its filters in the URL; here they live in
 * state, because nothing in this dialog may navigate. Search by meaning and "Favorites only" are
 * not here (owner: "Rebuild in modal", 2026-11-25).
 */
export function WizardReferenceLibrary({ selected, onChange }: WizardReferenceLibraryProps): ReactElement {
  const t = useWebMessages();
  const { locale } = useI18n();
  const linkTexts = t.catalog.linkBox;
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);
  const [category, setCategory] = useState<CatalogCategory | null>(null);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [linkText, setLinkText] = useState('');
  const [link, setLink] = useState<VideoLink>({ status: 'absent' });
  const [justSaved, setJustSaved] = useState(false);
  const [customCategories] = useState<readonly CustomCategory[]>(storedCustomCategories);
  const customLabels = useMemo(() => customCategoryLabels(customCategories), [customCategories]);
  const byScore = filters.sort === 'quality';
  const full = selected.length >= MAX_RUN_REFERENCES;

  useEffect(() => {
    let current = true;
    setList({ status: 'loading' });
    browserStudioClient
      .searchAssets({
        text: filters.text === '' ? undefined : filters.text,
        kinds: [...kindsOfSection(SECTION)],
        statuses: filters.status === null ? listedAssetStatuses : [filters.status],
        // A run cannot take a biometric item as a reference, so the dialog does not list them.
        sensitivity: 'exclude-biometric',
        sort: byScore ? 'quality' : undefined,
        minQuality: filters.minQuality ?? undefined,
        minSampleSize: filters.minSampleSize ?? undefined,
        limit: 100,
      })
      .then((page) => {
        if (!current) return;
        const folded = byScore ? [...page.items] : representativeVersions(page.items);
        setList({ status: 'done', versions: folded.filter((version) => versionInSection(SECTION, version)) });
      })
      .catch((error: unknown) => {
        if (current) setList({ status: 'failed', message: describeApiError(error, t) });
      });
    return () => {
      current = false;
    };
  }, [filters, byScore, reload, t]);

  function add(version: AssetVersionView): void {
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    if (!selected.includes(ref) && !full) onChange([...selected, ref]);
  }

  function handleLinkSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setJustSaved(false);
    setLink(videoLinkFrom(linkText.trim()));
  }

  function clearLink(): void {
    setLinkText('');
    setLink({ status: 'absent' });
  }

  const all = list.status === 'done' ? list.versions : [];
  const counts = countTemplateCategories(all);
  const versions = category === null ? all : all.filter((version) => templateCategoryOf(version) === category);
  const tabs: (CatalogCategory | null)[] = [null, ...counts.keys()];
  const groupTab = onlyKindOfSection(SECTION);

  return (
    <div className={layout.stackLarge}>
      <section aria-labelledby="assistente-referencia-link-titulo" className={layout.stack}>
        <h3 id="assistente-referencia-link-titulo" className="heading-2">
          {linkTexts.title}
        </h3>
        <form className={catalogStyles.linkForm} onSubmit={handleLinkSubmit}>
          <div className={catalogStyles.linkField}>
            <Label htmlFor={LINK_INPUT_ID}>{linkTexts.label}</Label>
            <Input
              id={LINK_INPUT_ID}
              type="url"
              inputMode="url"
              required
              maxLength={500}
              placeholder={linkTexts.placeholder}
              aria-describedby={`${LINK_INPUT_ID}-ajuda`}
              invalid={link.status === 'unsupported'}
              value={linkText}
              onChange={(event) => setLinkText(event.currentTarget.value)}
            />
          </div>
          <Button type="submit" variant="primary">
            {linkTexts.submit}
          </Button>
          {link.status !== 'absent' && (
            <Button variant="ghost" onClick={clearLink}>
              {linkTexts.clear}
            </Button>
          )}
        </form>
        <p id={`${LINK_INPUT_ID}-ajuda`} className="caption">
          {linkTexts.help}
        </p>
        {justSaved && <Alert variant="success">{linkTexts.save.saved}</Alert>}
        {link.status === 'unsupported' && <Alert variant="warning">{linkTexts.unsupported}</Alert>}
        {link.status === 'supported' && (
          <div className={catalogStyles.linkPreview}>
            <VideoEmbed
              key={`embed:${videoPostKey(link.post)}`}
              post={link.post}
              title={linkTexts.embedTitle(linkTexts.platforms[link.post.platform], link.post.id)}
            />
            <SaveReferenceLinkForm
              key={`form:${videoPostKey(link.post)}`}
              post={link.post}
              initialCustomCategories={customCategories}
              onSaved={(saved) => {
                add(saved);
                clearLink();
                setJustSaved(true);
                setReload((count) => count + 1);
              }}
            />
          </div>
        )}
      </section>

      <CatalogFilterBar filters={filters} onFiltersChange={setFilters} />
      <QualityFormulaExplanation />

      {list.status === 'loading' && <Spinner size="sm" label={t.runs.references.searching} />}
      {list.status === 'failed' && <Alert variant="error">{list.message}</Alert>}
      {list.status === 'done' && all.length > 0 && (
        <div role="tablist" aria-label={t.catalog.tabs.referenceCategoriesLabel} className={catalogStyles.segmentList}>
          {tabs.map((tab) => (
            <button
              key={tab ?? 'all'}
              type="button"
              role="tab"
              aria-selected={category === tab}
              className={classNames(catalogStyles.segment, category === tab && catalogStyles.segmentSelected)}
              onClick={() => setCategory(tab)}
            >
              <span className="label">{tab === null ? t.catalog.tabs.all : categoryLabelOf(tab, t.catalog.categories.templateTypes, customLabels)}</span>
              <Badge tone="neutral">{String(tab === null ? all.length : (counts.get(tab) ?? 0))}</Badge>
            </button>
          ))}
        </div>
      )}
      {list.status === 'done' && versions.length === 0 && (
        <EmptyState title={t.catalog.list.noResultsTitle} description={t.catalog.list.noResultsDescription} />
      )}
      {list.status === 'done' && versions.length > 0 && (
        <>
          <p className="caption">{t.catalog.list.assetCount(versions.length)}</p>
          {groupCatalogVersions(versions, groupTab).map((group) => (
            <section key={group.id} className={layout.stack}>
              <div className={catalogStyles.groupHeading}>
                <h3 className="heading-2">{catalogGroupLabel(group, groupTab, t.catalog)}</h3>
                <span className="caption">{t.catalog.list.assetCount(group.versions.length)}</span>
              </div>
              <ul className={layout.cardGrid}>
                {group.versions.map((version) => {
                  const ref = formatAssetRef({ assetId: version.id, version: version.version });
                  return (
                    <li key={ref}>
                      <WizardLibraryCard version={version} added={selected.includes(ref)} full={full} onAdd={() => add(version)} t={t} locale={locale} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
