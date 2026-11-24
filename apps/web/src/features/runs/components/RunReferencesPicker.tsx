'use client';

import { Alert, Button, SearchField, Spinner } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
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
  const t = useWebMessages();
  const texts = t.runs.references;
  const [text, setText] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  async function runSearch(): Promise<void> {
    setSearch({ status: 'loading' });
    try {
      const page = await browserStudioClient.searchAssets({ text: text.trim(), sensitivity: 'exclude-biometric', limit: SEARCH_LIMIT });
      setSearch({ status: 'done', items: page.items.filter((item) => item.sensitivity !== 'biometric') });
    } catch (error) {
      setSearch({ status: 'failed', message: describeRunError(error, t) });
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
          label={texts.searchLabel}
          value={text}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <Button variant="secondary" disabled={disabled} onClick={() => void runSearch()}>
          {texts.search}
        </Button>
      </div>
      {search.status === 'loading' && <Spinner size="sm" label={texts.searching} />}
      {search.status === 'failed' && <Alert variant="error">{search.message}</Alert>}
      {search.status === 'done' && search.items.length === 0 && <p className="caption">{texts.noResults}</p>}
      {search.status === 'done' && search.items.length > 0 && (
        <ul className={styles.selectedRefs} aria-label={texts.resultsLabel}>
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
                  {added ? texts.added : texts.add}
                  <span className="visually-hidden"> {ref}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {selected.length > 0 && (
        <ul className={styles.selectedRefs} aria-label={texts.selectedLabel}>
          {selected.map((ref) => (
            <li key={ref} className={styles.refRow}>
              <span className="mono">{ref}</span>
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(selected.filter((candidate) => candidate !== ref))}>
                {texts.remove}
                <span className="visually-hidden"> {ref}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
