'use client';

import { Alert, Button, EmptyState, FormField, Spinner, Textarea, useI18n } from '@studio/ui';
import { type SearchIndexStatusResponse, type SemanticSearchResponse } from '@studio/shared/api';
import { SEMANTIC_SEARCH_QUERY_MAX_CHARS, type AssetKind, type AssetStatus } from '@studio/shared/catalog';
import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { versionInSection, type CatalogSection } from '@/features/catalog/catalog-sections';
import { CatalogAssetItem } from '@/features/catalog/components/CatalogAssetItem';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { ApiRequestError } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { pendingIndexText, similarityText } from '../search-labels';
import { browserSemanticSearchApi } from '../semantic-search-api';

interface SemanticSearchPanelProps {
  /** `GET /catalog/search/status` read on the server; null when it could not be read. */
  status: SearchIndexStatusResponse | null;
  /** The kinds of the URL's section (or its one picked kind) and its status filter, applied to the search too. */
  kinds: readonly AssetKind[];
  /** The URL's section: Sites and References share the `reference` kind, so results are split by subtype here. */
  section: CatalogSection;
  assetStatus: AssetStatus | null;
  /** The By words / By meaning switch, shown right under the query box (or the unavailable notice). */
  modeSwitch: ReactNode;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; response: SemanticSearchResponse }
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

const QUERY_ID = 'busca-significado';

/**
 * "Por significado" (SPEC 0003 section 5.2, B10): the owner describes what they want and the local
 * model ranks versions by similarity, top 8, no threshold, biometric versions excluded. The query
 * stays in component state and goes out in a POST body only. `pending` is always shown, so an
 * incomplete index is never silent; results render as text.
 */
export function SemanticSearchPanel({ status, kinds, section, assetStatus, modeSwitch }: SemanticSearchPanelProps): ReactElement {
  const [query, setQuery] = useState('');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  const { locale } = useI18n();
  const messages = useWebMessages();
  const searchTexts = messages.catalog.search;
  const indexPending = status === null ? null : pendingIndexText(status.pending + status.stale, searchTexts, locale);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (search.status === 'loading') return;
    const text = query.trim();
    if (text === '' || text.length > SEMANTIC_SEARCH_QUERY_MAX_CHARS) {
      setQueryError(searchTexts.queryLength(SEMANTIC_SEARCH_QUERY_MAX_CHARS));
      document.getElementById(QUERY_ID)?.focus();
      return;
    }
    setQueryError(null);
    setSearch({ status: 'loading' });
    try {
      const response = await browserSemanticSearchApi.search({
        query: text,
        kinds: [...kinds],
        statuses: assetStatus === null ? undefined : [assetStatus],
      });
      setSearch({ status: 'done', response: { ...response, items: response.items.filter((item) => versionInSection(section, item.version)) } });
    } catch (error) {
      const unavailable = error instanceof ApiRequestError && error.reason === 'embedding-unavailable';
      setSearch({ status: unavailable ? 'unavailable' : 'failed', message: describeApiError(error, messages) });
    }
  }

  if (status !== null && status.model !== 'ready') {
    return (
      <div className={layout.stack}>
        <Alert variant="warning" title={searchTexts.unavailableTitle}>
          {searchTexts.unavailableBody(searchTexts.modelStates[status.model])}
        </Alert>
        {modeSwitch}
      </div>
    );
  }

  return (
    <div className={layout.stack}>
      {status === null && <Alert variant="warning">{searchTexts.statusUnreadable}</Alert>}
      {indexPending !== null && (
        <Alert variant="info">{searchTexts.pendingNotice(indexPending)}</Alert>
      )}
      <form className={layout.stack} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <FormField
          id={QUERY_ID}
          label={searchTexts.queryLabel}
          help={searchTexts.queryHelp}
          error={queryError ?? undefined}
          disabled={search.status === 'loading'}
        >
          {({ invalid, ...control }) => (
            <Textarea
              {...control}
              invalid={invalid}
              rows={2}
              maxLength={SEMANTIC_SEARCH_QUERY_MAX_CHARS}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          )}
        </FormField>
        <div className={layout.formFooter}>
          <Button type="submit" variant="primary" loading={search.status === 'loading'} loadingLabel={searchTexts.searching}>
            {searchTexts.submit}
          </Button>
        </div>
      </form>
      {modeSwitch}
      {search.status === 'loading' && <Spinner size="sm" label={searchTexts.spinner} />}
      {(search.status === 'failed' || search.status === 'unavailable') && <Alert variant="error">{search.message}</Alert>}
      {search.status === 'done' && <SemanticResults response={search.response} />}
    </div>
  );
}

function SemanticResults({ response }: { response: SemanticSearchResponse }): ReactElement {
  const { locale } = useI18n();
  const catalogTexts = useWebMessages().catalog;
  const pending = pendingIndexText(response.pending, catalogTexts.search, locale);
  const searchTexts = catalogTexts.search;
  const countText = searchTexts.resultCount(response.items.length);
  return (
    <div className={layout.stack}>
      <p className="caption" aria-live="polite">
        {pending === null ? countText : searchTexts.resultCountWithPending(countText, pending)}
      </p>
      {response.items.length === 0 ? (
        <EmptyState title={searchTexts.noResultsTitle} description={searchTexts.noResultsDescription} />
      ) : (
        <ol className={layout.cardGrid} aria-label={searchTexts.resultsLabel}>
          {response.items.map((item) => (
            <li key={`${item.version.id}@${item.version.version}`}>
              <CatalogAssetItem
                version={item.version}
                linkToVersion
                detail={similarityText(item.similarity, catalogTexts.search, locale)}
                t={catalogTexts}
                locale={locale}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
