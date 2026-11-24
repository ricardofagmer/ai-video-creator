'use client';

import { Button, FormField, Input } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import { scheduleBounds } from '@studio/shared/schedules';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { RunBriefFields } from '@/features/runs/components/RunBriefFields';
import { buildBrief, initialValues, newRunFieldIds, newRunFieldOrder, type NewRunErrors, type NewRunField, type NewRunFormValues } from '@/features/runs/new-run-model';
import { scheduleFieldIds, type QueuedBrief } from '../schedule-form-model';
import styles from '../schedules.module.css';

interface ScheduleBriefQueueEditorProps {
  recipe: RecipeVersionView;
  queue: readonly QueuedBrief[];
  error: string | undefined;
  disabled: boolean;
  onQueueChange: (queue: readonly QueuedBrief[]) => void;
}

const BRIEF_TITLE_ID = 'agendamento-briefing-titulo';
const BRIEF_TITLE_MAX_CHARS = 200;

/**
 * The brief queue of a new schedule (SPEC 0006 Q5: queue mode only). Each slot that fires uses the
 * next unused brief; when the queue is empty the slot is skipped, never repeated. Briefs are built
 * with the same fields and rules as "Nova execução" (`buildBrief`), for the chosen recipe.
 */
export function ScheduleBriefQueueEditor({ recipe, queue, error, disabled, onQueueChange }: ScheduleBriefQueueEditorProps): ReactElement {
  const t = useWebMessages();
  const texts = t.schedules.queueEditor;
  const [values, setValues] = useState<NewRunFormValues>(() => initialValues(recipe));
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<NewRunErrors & { title?: string }>({});

  const full = queue.length >= scheduleBounds.maxBriefs;

  function update(field: NewRunField, value: string): void {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function addToQueue(): void {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length > BRIEF_TITLE_MAX_CHARS) {
      setErrors({ title: texts.titleTooLong(BRIEF_TITLE_MAX_CHARS) });
      document.getElementById(BRIEF_TITLE_ID)?.focus();
      return;
    }
    const result = buildBrief(values, recipe.recipe, t.runs.brief.errors);
    if (result.kind === 'invalid') {
      setErrors(result.errors);
      const first = newRunFieldOrder.find((field) => result.errors[field] !== undefined);
      if (first !== undefined) document.getElementById(newRunFieldIds[first])?.focus();
      return;
    }
    setErrors({});
    onQueueChange([...queue, { key: crypto.randomUUID(), title: trimmedTitle === '' ? null : trimmedTitle, brief: result.brief }]);
    setValues(initialValues(recipe));
    setTitle('');
    document.getElementById(BRIEF_TITLE_ID)?.focus();
  }

  // Enter in a brief input adds the brief instead of submitting the whole schedule form.
  function handleKeyDown(event: KeyboardEvent<HTMLFieldSetElement>): void {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      addToQueue();
    }
  }

  return (
    <div className={layout.stack}>
      <div id={scheduleFieldIds.briefs} tabIndex={-1} className={layout.stack}>
        <p className="caption">
          {texts.help(scheduleBounds.maxBriefs)}
        </p>
        {queue.length === 0 ? (
          <p className="caption">{texts.empty}</p>
        ) : (
          <ol className={styles.briefQueue} aria-label={texts.queuedLabel}>
            {queue.map((entry, index) => (
              <li key={entry.key} className={styles.briefQueueItem}>
                <span className={styles.plainText}>{`${index + 1}. ${entry.title ?? entry.brief.topic}`}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onQueueChange(queue.filter((candidate) => candidate.key !== entry.key))}
                >
                  {texts.remove}
                  <span className="visually-hidden">{texts.removeHidden(index + 1)}</span>
                </Button>
              </li>
            ))}
          </ol>
        )}
        {error !== undefined && <p className={layout.fieldError}>{error}</p>}
      </div>
      {!full && (
        <fieldset className={layout.fieldset} disabled={disabled} onKeyDown={handleKeyDown}>
          <legend className="label">{texts.newBrief}</legend>
          <div className={layout.stack}>
            <FormField id={BRIEF_TITLE_ID} label={texts.briefTitle} optional error={errors.title} disabled={disabled}>
              {({ invalid, ...control }) => (
                <Input
                  {...control}
                  invalid={invalid}
                  maxLength={BRIEF_TITLE_MAX_CHARS}
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
              )}
            </FormField>
            <RunBriefFields values={values} errors={errors} recipe={recipe.recipe} disabled={disabled} onChange={update} />
            <div>
              <Button type="button" variant="secondary" disabled={disabled} onClick={addToQueue}>
                {texts.add}
              </Button>
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}
