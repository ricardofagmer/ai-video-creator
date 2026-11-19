'use client';

import { Alert, Button, FormField, Select, Textarea } from '@studio/ui';
import { LEARNING_NOTE_MAX_CHARS, normalizeLearningText } from '@studio/shared/catalog';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { describeRunError } from '@/features/runs/run-error-text';
import { ApiRequestError } from '@/lib/api';
import { browserLearningsApi } from '../learnings-api';
import { type LearningTarget } from '../learning-target';

interface LearningSaveFormProps {
  runId: string;
  targets: readonly LearningTarget[];
}

const REF_ID = 'aprendizado-versao';
const TEXT_ID = 'aprendizado-texto';

/** Refusals about the text are shown on the text field; the rest above the form. */
const textReasons: ReadonlySet<string> = new Set(['learning-contains-secret', 'invalid-learning-input', 'learning-secret-scan-unavailable']);

/**
 * "Salvar aprendizado" on the review screen (SPEC 0003 section 5.5, R2-AC-22): the owner picks one
 * version this run used and writes a note of up to 500 characters. The text is sent in the stored
 * form (`normalizeLearningText`: line breaks become spaces), so the counter matches what is kept.
 * A text that looks like a secret is refused by the api and nothing is stored.
 */
export function LearningSaveForm({ runId, targets }: LearningSaveFormProps): ReactElement {
  const router = useRouter();
  const [ref, setRef] = useState(targets[0]?.ref ?? '');
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedRef, setSavedRef] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const normalized = normalizeLearningText(text);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    setSavedRef(null);
    if (normalized.length === 0 || normalized.length > LEARNING_NOTE_MAX_CHARS) {
      setTextError(`Escreva de 1 a ${LEARNING_NOTE_MAX_CHARS} caracteres.`);
      document.getElementById(TEXT_ID)?.focus();
      return;
    }
    setTextError(null);
    setPending(true);
    try {
      const note = await browserLearningsApi.saveFromRun(runId, { ref, text: normalized });
      setSavedRef(note.ref);
      setText('');
      router.refresh();
    } catch (error) {
      const message = describeRunError(error);
      if (error instanceof ApiRequestError && error.reason !== null && textReasons.has(error.reason)) {
        setTextError(message);
        document.getElementById(TEXT_ID)?.focus();
      } else {
        setServerError(message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={layout.stack} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      {savedRef !== null && <Alert variant="success">{`Aprendizado salvo em ${savedRef}. Ele entra nos briefings das próximas execuções que usarem esta versão.`}</Alert>}
      <FormField id={REF_ID} label="Versão usada nesta execução" disabled={pending}>
        {({ invalid, ...control }) => (
          <Select
            {...control}
            invalid={invalid}
            options={targets.map((target) => ({ value: target.ref, label: target.label }))}
            value={ref}
            onChange={(event) => setRef(event.currentTarget.value)}
          />
        )}
      </FormField>
      <FormField
        id={TEXT_ID}
        label="Aprendizado"
        help={`${normalized.length} de ${LEARNING_NOTE_MAX_CHARS} caracteres. Quebras de linha viram espaços. Não escreva senhas nem chaves.`}
        error={textError ?? undefined}
        disabled={pending}
      >
        {({ invalid, ...control }) => (
          <Textarea
            {...control}
            invalid={invalid}
            rows={3}
            placeholder="Ex.: legendas a 74% da altura cobrem os botões do app em 16:9."
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
          />
        )}
      </FormField>
      <div className={layout.formFooter}>
        <Button type="submit" variant="secondary" loading={pending} loadingLabel="Salvando…">
          Salvar aprendizado
        </Button>
      </div>
    </form>
  );
}
