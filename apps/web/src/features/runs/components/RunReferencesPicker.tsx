'use client';

import { Alert, Button, SearchField, Spinner } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { isPicture } from '@studio/shared/recipes';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement } from 'react';
import { customCategoriesFromCookie, type CustomCategory } from '@/features/catalog/custom-categories';
import { IMAGE_CATEGORIES_COOKIE, imageBuiltInCategories, imageCategoryLabelOf, imageCategoryNameOf } from '@/features/catalog/image-categories';
import { acceptAttribute } from '@/features/catalog/upload-rules';
import layout from '@/features/common/layout.module.css';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { describeRunError } from '../run-error-text';
import { runImageDraftOf, runImageProblemOf } from '../run-image-upload';
import styles from '../runs.module.css';
import { RunImageCategoryTabs, type RunImageCategoryTab } from './RunImageCategoryTabs';
import { RunImageTile } from './RunImageTile';

/** C10 `CreateRunRequest.references` holds at most 50 refs. */
export const MAX_RUN_REFERENCES = 50;
const SEARCH_LIMIT = 10;
/** One category tab loads at most this many squares; the catalog page holds the rest. */
const CATEGORY_LIMIT = 24;
const RECENT_TAB = 'recent';
const SEARCH_KEY = 'search';
const GRID_PANEL_ID = 'referencias-imagens';

interface RunReferencesPickerProps {
  selected: readonly string[];
  onChange: (refs: string[]) => void;
  disabled: boolean;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; items: readonly AssetVersionView[] }
  | { status: 'failed'; message: string };

type UploadState = { status: 'idle' } | { status: 'uploading' } | { status: 'failed'; message: string };

/** What the run can put on screen: images and picture-like references, never biometric rows. */
function picturesOf(items: readonly AssetVersionView[]): AssetVersionView[] {
  return items.filter((item) =>
    isPicture({
      kind: item.kind,
      subKind: item.kind === 'reference' ? item.details.subKind : undefined,
      biometric: item.sensitivity === 'biometric',
    }),
  );
}

function cookieValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
}

async function imageSizeOf(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * "Referências desta execução" (design/telas/07). C10 takes catalog refs (`assetId@version`), so a
 * picked or pasted picture is first saved to the catalog as a draft image, then added by its ref.
 * The catalog's pictures show as small squares, one category tab at a time: a tab is fetched the first
 * time it is opened and kept for the page's life, so the page never loads the whole library. Biometric
 * rows are excluded; the name is the square's tooltip and accessible name.
 */
export function RunReferencesPicker({ selected, onChange, disabled }: RunReferencesPickerProps): ReactElement {
  const t = useWebMessages();
  const texts = t.runs.references;
  const imageCategoryTexts = t.catalog.categories.imageCategories;
  const [text, setText] = useState('');
  const [activeTab, setActiveTab] = useState<string>(RECENT_TAB);
  const [showingSearch, setShowingSearch] = useState(false);
  const [pages, setPages] = useState<Readonly<Record<string, SearchState>>>({});
  const [customCategories, setCustomCategories] = useState<readonly CustomCategory[]>([]);
  // Every version seen on this page, so a chosen ref keeps its picture after its tab changes.
  const [known, setKnown] = useState<ReadonlyMap<string, AssetVersionView>>(new Map());
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef({ selected, onChange, disabled, uploading: false });
  latest.current = { selected, onChange, disabled, uploading: upload.status === 'uploading' };

  function remember(items: readonly AssetVersionView[]): void {
    setKnown((previous) => {
      const next = new Map(previous);
      for (const item of items) next.set(formatAssetRef({ assetId: item.id, version: item.version }), item);
      return next;
    });
  }

  async function fetchPage(key: string, query: string): Promise<readonly AssetVersionView[]> {
    if (key === SEARCH_KEY) {
      const page = await browserStudioClient.searchAssets({ text: query, sensitivity: 'exclude-biometric', limit: SEARCH_LIMIT });
      return page.items.filter((item) => item.sensitivity !== 'biometric');
    }
    // Recent: the catalog's pictures, the inputs a run without a site capture needs.
    const page =
      key === RECENT_TAB
        ? await browserStudioClient.searchAssets({ kinds: ['image', 'reference'], sensitivity: 'exclude-biometric', limit: CATEGORY_LIMIT * 2 })
        : await browserStudioClient.searchAssets({ kinds: ['image'], tags: [key], sensitivity: 'exclude-biometric', limit: CATEGORY_LIMIT });
    return picturesOf(page.items).slice(0, CATEGORY_LIMIT);
  }

  async function load(key: string, query = ''): Promise<void> {
    setPages((previous) => ({ ...previous, [key]: { status: 'loading' } }));
    try {
      const items = await fetchPage(key, query);
      remember(items);
      setPages((previous) => ({ ...previous, [key]: { status: 'done', items } }));
    } catch (error) {
      setPages((previous) => ({ ...previous, [key]: { status: 'failed', message: describeRunError(error, t) } }));
    }
  }

  function openTab(key: string): void {
    setActiveTab(key);
    setShowingSearch(false);
    const state = pages[key];
    // A tab is fetched once; a failed one is fetched again when it is opened again.
    if (state === undefined || state.status === 'failed') void load(key);
  }

  function runSearch(query: string): void {
    if (query === '') {
      openTab(activeTab);
      return;
    }
    setShowingSearch(true);
    void load(SEARCH_KEY, query);
  }

  async function addImage(file: File): Promise<void> {
    const current = latest.current;
    if (current.disabled || current.uploading || current.selected.length >= MAX_RUN_REFERENCES) return;
    const problem = runImageProblemOf(file);
    if (problem !== null) {
      setUpload({ status: 'failed', message: problem === 'type' ? texts.uploadWrongType : texts.uploadTooLarge });
      return;
    }
    setUpload({ status: 'uploading' });
    try {
      const size = await imageSizeOf(file);
      const draft = runImageDraftOf({ file, ...size, owner: texts.uploadOwner, fallbackName: texts.uploadDefaultName, now: Date.now() });
      const saved = await browserStudioClient.createAsset({
        fields: { assetId: draft.assetId, kind: draft.kind, metadata: draft.metadata },
        content: { layout: 'file', file: draft.file },
      });
      const ref = formatAssetRef({ assetId: saved.id, version: saved.version });
      remember([saved]);
      const after = latest.current;
      if (!after.selected.includes(ref)) after.onChange([...after.selected, ref]);
      setUpload({ status: 'idle' });
    } catch (error) {
      setUpload({ status: 'failed', message: error instanceof DOMException ? texts.uploadUnreadable : describeRunError(error, t) });
    }
  }

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    // Cleared so picking the same file again fires another change.
    event.currentTarget.value = '';
    if (file !== undefined) void addImage(file);
  }

  useEffect(() => {
    setCustomCategories(customCategoriesFromCookie(cookieValue(IMAGE_CATEGORIES_COOKIE)));
    void load(RECENT_TAB);
    // A pasted picture anywhere on the page goes to the references; pasted text is left alone.
    function handlePaste(event: ClipboardEvent): void {
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith('image/'));
      if (file === undefined) return;
      event.preventDefault();
      void addImage(file);
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
    // Runs once: the handlers read the latest props through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Enter searches instead of submitting the surrounding run form.
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runSearch(text.trim());
  }

  const tabs: RunImageCategoryTab[] = [
    { key: RECENT_TAB, label: texts.recent },
    ...imageBuiltInCategories.map((category) => ({ key: category, label: imageCategoryLabelOf(category, imageCategoryTexts, new Map()) })),
    ...customCategories
      .filter((custom) => imageCategoryNameOf(custom.id) === null)
      .map((custom) => ({ key: custom.id, label: custom.label })),
  ];
  const shownKey = showingSearch ? SEARCH_KEY : activeTab;
  const shown = pages[shownKey] ?? { status: 'idle' };
  const full = selected.length >= MAX_RUN_REFERENCES;

  return (
    <div className={layout.stack}>
      <div className={layout.row}>
        <SearchField
          id="busca-referencias"
          label={texts.searchLabel}
          value={text}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <Button variant="secondary" disabled={disabled} onClick={() => runSearch(text.trim())}>
          {texts.search}
        </Button>
      </div>
      <div className={layout.row}>
        <input
          ref={fileInput}
          type="file"
          accept={acceptAttribute('image')}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileChosen}
        />
        <Button variant="secondary" disabled={disabled || full || upload.status === 'uploading'} onClick={() => fileInput.current?.click()}>
          {texts.uploadImage}
        </Button>
        <p className="caption">{texts.uploadHelp}</p>
      </div>
      {upload.status === 'uploading' && <Spinner size="sm" label={texts.uploading} />}
      {upload.status === 'failed' && <Alert variant="error">{upload.message}</Alert>}
      <RunImageCategoryTabs
        label={t.catalog.tabs.imageCategoriesLabel}
        tabs={tabs}
        selected={showingSearch ? null : activeTab}
        panelId={GRID_PANEL_ID}
        onSelect={openTab}
      />
      <div id={GRID_PANEL_ID} role="tabpanel" aria-label={showingSearch ? texts.resultsLabel : undefined} className={layout.stack}>
        {shown.status === 'loading' && <Spinner size="sm" label={texts.searching} />}
        {shown.status === 'failed' && <Alert variant="error">{shown.message}</Alert>}
        {shown.status === 'done' && shown.items.length === 0 && <p className="caption">{showingSearch ? texts.noResults : activeTab === RECENT_TAB ? texts.noPictures : texts.emptyCategory}</p>}
        {shown.status === 'done' && shown.items.length > 0 && (
          <ul className={styles.imageGrid} aria-label={texts.resultsLabel}>
            {shown.items.map((item) => {
              const ref = formatAssetRef({ assetId: item.id, version: item.version });
              const added = selected.includes(ref);
              return (
                <li key={ref}>
                  <RunImageTile
                    version={item}
                    name={item.name}
                    actionLabel={`${added ? texts.added : texts.add}: ${item.name}`}
                    pressed={added}
                    disabled={disabled || added || full}
                    onClick={() => onChange([...selected, ref])}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selected.length > 0 && (
        <>
          <p className="caption">{texts.selectedLabel}</p>
          <ul className={styles.imageGrid} aria-label={texts.selectedLabel}>
            {selected.map((ref) => {
              const version = known.get(ref);
              const name = version?.name ?? ref;
              return (
                <li key={ref}>
                  <RunImageTile
                    version={version}
                    name={name}
                    actionLabel={`${texts.remove}: ${name}`}
                    removable
                    disabled={disabled}
                    onClick={() => onChange(selected.filter((candidate) => candidate !== ref))}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
