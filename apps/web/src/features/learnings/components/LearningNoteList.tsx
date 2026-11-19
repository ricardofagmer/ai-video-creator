'use client';

import { Alert, Badge, Button, Dialog, textLinkClassName } from '@studio/ui';
import { type LearningNoteView } from '@studio/shared/api';
import { parseAssetRef } from '@studio/shared/catalog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { formatDateTime } from '@/features/catalog/catalog-labels';
import { describeApiError } from '@/features/common/api-error-text';
import { browserLearningsApi } from '../learnings-api';
import styles from '../learnings.module.css';

interface LearningNoteListProps {
  notes: readonly LearningNoteView[];
  /** Show each note's asset ref (the review screen lists notes of several versions). */
  showRef: boolean;
  emptyText: string;
}

/**
 * "Aprendizados" (SPEC 0003 section 5.5): notes written back from reviewed runs, newest first, each
 * linking to its run. The text is untrusted data and renders as text through React's escaping,
 * never as HTML. "Aposentar" retires a note through its own version; nothing is deleted.
 */
export function LearningNoteList({ notes, showRef, emptyText }: LearningNoteListProps): ReactElement {
  const router = useRouter();
  const [confirming, setConfirming] = useState<LearningNoteView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retire(note: LearningNoteView): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const { assetId, version } = parseAssetRef(note.ref);
      await browserLearningsApi.retire({ assetId, version, noteId: note.noteId });
      setConfirming(null);
      router.refresh();
    } catch (failure) {
      setConfirming(null);
      setError(describeApiError(failure));
    } finally {
      setPending(false);
    }
  }

  if (notes.length === 0) return <p className="caption">{emptyText}</p>;

  return (
    <div className={styles.stack}>
      {error !== null && <Alert variant="error">{error}</Alert>}
      <ul className={styles.noteList}>
        {notes.map((note) => (
          <li key={note.noteId} className={styles.note}>
            <p className={styles.noteText}>{note.text}</p>
            <div className={styles.noteMeta}>
              {note.status === 'active' ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Aposentado</Badge>}
              {showRef && <span className="mono">{note.ref}</span>}
              <Link href={`/execucoes/${note.sourceRunId}/revisao`} className={textLinkClassName()}>
                Execução <span className="mono">{note.sourceRunId}</span>
              </Link>
              <span>{`${formatDateTime(note.createdAt)} · ${note.createdBy}`}</span>
              {note.retiredAt !== null && <span>{`Aposentado em ${formatDateTime(note.retiredAt)}`}</span>}
              {note.status === 'active' && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(note)}>
                  Aposentar<span className="visually-hidden"> o aprendizado de {note.ref}</span>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Dialog
        open={confirming !== null}
        onClose={() => (pending ? undefined : setConfirming(null))}
        title="Aposentar este aprendizado?"
        description="Ele deixa de entrar nos briefings das próximas execuções e na busca por significado. Continua visível aqui como aposentado; nada é apagado."
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={pending}
              loadingLabel="Aposentando…"
              onClick={() => (confirming === null ? undefined : void retire(confirming))}
            >
              Aposentar
            </Button>
          </>
        }
      >
        {confirming !== null && <p className={styles.noteText}>{confirming.text}</p>}
      </Dialog>
    </div>
  );
}
