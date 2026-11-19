'use client';

import { Alert, Button, EmptyState, FormField, Spinner, Textarea } from '@studio/ui';
import { type SearchIndexStatusResponse, type SemanticSearchResponse } from '@studio/shared/api';
import { SEMANTIC_SEARCH_QUERY_MAX_CHARS, type AssetKind, type AssetStatus } from '@studio/shared/catalog';
import { useState, type FormEvent, type ReactElement } from 'react';
import { CatalogAssetItem } from '@/features/catalog/components/CatalogAssetItem';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { ApiRequestError } from '@/lib/api';
import { pendingIndexText, searchModelLabels, similarityText } from '../search-labels';
import { browserSemanticSearchApi } from '../semantic-search-api';

interface SemanticSearchPanelProps {
  /** `GET /catalog/search/status` read on the server; null when it could not be read. */
  status: SearchIndexStatusResponse | null;
  /** The URL's kind and status filters, applied to the search too. */
  kind: AssetKind | null;
  assetStatus: AssetStatus | null;
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
export function SemanticSearchPanel({ status, kind, assetStatus }: SemanticSearchPanelProps): ReactElement {
  const [query, setQuery] = useState('');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  const indexPending = status === null ? null : pendingIndexText(status.pending + status.stale);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (search.status === 'loading') return;
    const text = query.trim();
    if (text === '' || text.length > SEMANTIC_SEARCH_QUERY_MAX_CHARS) {
      setQueryError(`Escreva de 1 a ${SEMANTIC_SEARCH_QUERY_MAX_CHARS} caracteres.`);
      document.getElementById(QUERY_ID)?.focus();
      return;
    }
    setQueryError(null);
    setSearch({ status: 'loading' });
    try {
      const response = await browserSemanticSearchApi.search({
        query: text,
        kinds: kind === null ? undefined : [kind],
        statuses: assetStatus === null ? undefined : [assetStatus],
      });
      setSearch({ status: 'done', response });
    } catch (error) {
      const unavailable = error instanceof ApiRequestError && error.reason === 'embedding-unavailable';
      setSearch({ status: unavailable ? 'unavailable' : 'failed', message: describeApiError(error) });
    }
  }

  if (status !== null && status.model !== 'ready') {
    return (
      <Alert variant="warning" title="Busca por significado indisponível">
        {`${searchModelLabels[status.model]} A busca por palavras continua funcionando.`}
      </Alert>
    );
  }

  return (
    <div className={layout.stack}>
      {status === null && <Alert variant="warning">Não foi possível ler o estado do índice de busca. A busca ainda pode funcionar.</Alert>}
      {indexPending !== null && (
        <Alert variant="info">{`${indexPending}. Elas não aparecem nos resultados até o estúdio indexá-las.`}</Alert>
      )}
      <form className={layout.stack} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <FormField
          id={QUERY_ID}
          label="Descreva o que você procura"
          help="Em português ou inglês. O texto fica só neste computador e não é guardado no endereço da página."
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
          <Button type="submit" variant="primary" loading={search.status === 'loading'} loadingLabel="Buscando…">
            Buscar por significado
          </Button>
        </div>
      </form>
      {search.status === 'loading' && <Spinner size="sm" label="Buscando por significado" />}
      {(search.status === 'failed' || search.status === 'unavailable') && <Alert variant="error">{search.message}</Alert>}
      {search.status === 'done' && <SemanticResults response={search.response} />}
    </div>
  );
}

function SemanticResults({ response }: { response: SemanticSearchResponse }): ReactElement {
  const pending = pendingIndexText(response.pending);
  const countText = response.items.length === 1 ? '1 resultado' : `${response.items.length} resultados`;
  return (
    <div className={layout.stack}>
      <p className="caption" aria-live="polite">
        {pending === null ? countText : `${countText} · ${pending} entre os filtros escolhidos`}
      </p>
      {response.items.length === 0 ? (
        <EmptyState title="Nenhum ativo encontrado" description="Tente descrever de outro jeito ou use a busca por palavras." />
      ) : (
        <ol className={layout.cardGrid} aria-label="Resultados da busca por significado, do mais parecido ao menos parecido">
          {response.items.map((item) => (
            <li key={`${item.version.id}@${item.version.version}`}>
              <CatalogAssetItem version={item.version} linkToVersion detail={similarityText(item.similarity)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
