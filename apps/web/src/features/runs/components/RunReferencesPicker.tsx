'use client';

import { Alert, Button, SearchField, Spinner } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { browserStudioClient } from '@/lib/api';
import { describeRunError } from '../run-error-text';
import styles from '../runs.module.css';

/** C10 `CreateRunRequest.references` holds at most 50 refs. */
export const MAX_RUN_REFERENCES = 50;
const SEARCH_LIMIT = 10;

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

/**
 * "Referências desta execução" (design/telas/07). C10 takes catalog refs (`assetId@version`), not
 * uploads, so this searches the catalog and adds refs. The search excludes biometric rows and
 * shows names and refs only: no preview, no asset bytes.
 */
export function RunReferencesPicker({ selected, onChange, disabled }: RunReferencesPickerProps): ReactElement {
  const [text, setText] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  async function runSearch(): Promise<void> {
    setSearch({ status: 'loading' });
    try {
      const page = await browserStudioClient.searchAssets({ text: text.trim(), sensitivity: 'exclude-biometric', limit: SEARCH_LIMIT });
      setSearch({ status: 'done', items: page.items.filter((item) => item.sensitivity !== 'biometric') });
    } catch (error) {
      setSearch({ status: 'failed', message: describeRunError(error) });
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Enter searches instead of submitting the surrounding run form.
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void runSearch();
  }

  const full = selected.length >= MAX_RUN_REFERENCES;

  return (
    <div className={layout.stack}>
      <div className={layout.row}>
        <SearchField
          id="busca-referencias"
          label="Buscar no catálogo"
          value={text}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <Button variant="secondary" disabled={disabled} onClick={() => void runSearch()}>
          Buscar
        </Button>
      </div>
      {search.status === 'loading' && <Spinner size="sm" label="Buscando no catálogo" />}
      {search.status === 'failed' && <Alert variant="error">{search.message}</Alert>}
      {search.status === 'done' && search.items.length === 0 && <p className="caption">Nenhum ativo encontrado.</p>}
      {search.status === 'done' && search.items.length > 0 && (
        <ul className={styles.selectedRefs} aria-label="Resultados da busca">
          {search.items.map((item) => {
            const ref = formatAssetRef({ assetId: item.id, version: item.version });
            const added = selected.includes(ref);
            return (
              <li key={ref} className={styles.refRow}>
                <span className={styles.refName}>
                  <span>{item.name}</span>
                  <span className="mono caption">{ref}</span>
                </span>
                <Button size="sm" variant="secondary" disabled={disabled || added || full} onClick={() => onChange([...selected, ref])}>
                  {added ? 'Adicionada' : 'Adicionar'}
                  <span className="visually-hidden"> {ref}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {selected.length > 0 && (
        <ul className={styles.selectedRefs} aria-label="Referências escolhidas">
          {selected.map((ref) => (
            <li key={ref} className={styles.refRow}>
              <span className="mono">{ref}</span>
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(selected.filter((candidate) => candidate !== ref))}>
                Remover<span className="visually-hidden"> {ref}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
