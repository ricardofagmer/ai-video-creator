'use client';

import { Alert, FormField, Icon, Input, Textarea, textLinkClassName } from '@studio/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type CompositionConflict } from '@studio/shared/recipes';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { CompositionConflictList } from '@/features/common/components/CompositionConflictList';
import { conflictsOfApiError } from '@/features/common/composition-conflict-text';
import { type BindingOption } from '@/features/recipes/recipe-form-model';
import { useWebMessages } from '@/lib/i18n/client';
import { browserStudioClient } from '@/lib/api';
import { cartPresetDefinition, loadCartPresetOptions } from '../cart-preset';
import { CART_QUERY, type CartItem } from '../cart-store';
import styles from './CartPresetForm.module.css';

export const CART_PRESET_FORM_ID = 'carrinho-preset';

/** The footer button that submitted the form: plain save, or save then open the new run. */
export const CART_PRESET_INTENT = { save: 'salvar', run: 'criar-video' } as const;

const FIELD_IDS = { name: 'carrinho-preset-nome', description: 'carrinho-preset-descricao', owner: 'carrinho-preset-responsavel' } as const;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
const OWNER_MAX = 120;
// Remembered per browser so the owner types their name once; the form still works without storage.
const OWNER_STORAGE_KEY = 'studio.cart.preset-owner';

type FieldErrors = Partial<Record<'name' | 'owner', string>>;
type OptionsState = { status: 'loading' } | { status: 'ready'; options: readonly BindingOption[] } | { status: 'failed'; message: string };

export type CartPresetFormState = 'loading' | 'idle' | 'saving';

interface CartPresetFormProps {
  cart: readonly CartItem[];
  /** Tells the dialog footer whether its submit buttons may be pressed. */
  onStateChange: (state: CartPresetFormState) => void;
  /** Closes the cart dialog before navigating away. */
  onDone: () => void;
}

function readOwner(): string {
  try {
    return window.localStorage.getItem(OWNER_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberOwner(owner: string): void {
  try {
    window.localStorage.setItem(OWNER_STORAGE_KEY, owner);
  } catch {
    // Storage blocked: the owner types the name again next time.
  }
}

function intentOf(event: FormEvent<HTMLFormElement>): string | undefined {
  const native = event.nativeEvent;
  return native instanceof SubmitEvent && native.submitter instanceof HTMLElement ? native.submitter.dataset.intent : undefined;
}

/**
 * Checkout's "Save as preset" (2026-11-24): name, description and owner; the dialog footer saves the
 * cart as a new preset, or saves it and opens the new run with the cart's site and instructions.
 */
export function CartPresetForm({ cart, onStateChange, onDone }: CartPresetFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.cart.preset;
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; editorLink: boolean } | null>(null);
  const [conflicts, setConflicts] = useState<readonly CompositionConflict[]>([]);
  const [optionsState, setOptionsState] = useState<OptionsState>({ status: 'loading' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOwner(readOwner());
    let cancelled = false;
    loadCartPresetOptions()
      .then((options) => {
        if (!cancelled) setOptionsState({ status: 'ready', options });
      })
      .catch((error: unknown) => {
        if (!cancelled) setOptionsState({ status: 'failed', message: describeApiError(error, t) });
      });
    return () => {
      cancelled = true;
    };
    // Loaded once when checkout opens; the messages object does not change the request.
  }, []);

  useEffect(() => {
    onStateChange(saving ? 'saving' : optionsState.status === 'ready' ? 'idle' : 'loading');
  }, [saving, optionsState.status, onStateChange]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving || optionsState.status !== 'ready') return;
    const thenRun = intentOf(event) === CART_PRESET_INTENT.run;
    const errors: FieldErrors = {};
    if (name.trim() === '') errors.name = texts.nameRequired;
    if (owner.trim() === '') errors.owner = texts.ownerRequired;
    setFieldErrors(errors);
    setFormError(null);
    setConflicts([]);
    if (Object.keys(errors).length > 0) return;

    const { recipeId, result, conflicts: found } = cartPresetDefinition({ name, description, owner }, cart, optionsState.options, t);
    // Checked here too, so the owner sees what is missing before any request instead of a generic failure.
    if (found.length > 0) {
      setConflicts(found);
      setFormError({ message: texts.invalid, editorLink: true });
      return;
    }
    if (!result.ok) {
      setFormError({ message: texts.invalid, editorLink: true });
      return;
    }
    setSaving(true);
    rememberOwner(owner.trim());
    try {
      const saved = await browserStudioClient.createRecipe({ recipeId, definition: result.definition });
      onDone();
      router.push(
        thenRun
          ? `/execucoes/nova?receita=${saved.recipe.id}@${saved.recipe.version}&${CART_QUERY}=1`
          : `/receitas/${saved.recipe.id}?versao=${saved.recipe.version}&aviso=salvo`,
      );
    } catch (error) {
      setSaving(false);
      const rejected = conflictsOfApiError(error);
      setConflicts(rejected);
      setFormError({ message: texts.saveFailed(describeApiError(error, t)), editorLink: rejected.length > 0 });
    }
  }

  return (
    <form id={CART_PRESET_FORM_ID} className={styles.panel} noValidate aria-busy={saving} onSubmit={(event) => void save(event)}>
      <div className={styles.header}>
        <span className={styles.badge} aria-hidden="true">
          <Icon name="sparkles" />
        </span>
        <div className={styles.headerText}>
          <h3 className="overline">{texts.title}</h3>
          <p className="caption">{texts.help}</p>
        </div>
      </div>
      {optionsState.status === 'loading' && <p className="caption">{texts.loading}</p>}
      {optionsState.status === 'failed' && <Alert variant="error">{optionsState.message}</Alert>}
      <div className={styles.fields}>
        <FormField id={FIELD_IDS.name} label={texts.name} error={fieldErrors.name} disabled={saving}>
          {(control) => <Input {...control} value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} />}
        </FormField>
        <FormField id={FIELD_IDS.owner} label={texts.owner} error={fieldErrors.owner} disabled={saving}>
          {(control) => <Input {...control} value={owner} maxLength={OWNER_MAX} onChange={(event) => setOwner(event.target.value)} />}
        </FormField>
        <div className={styles.wide}>
          <FormField id={FIELD_IDS.description} label={texts.description} optional disabled={saving}>
            {(control) => (
              <Textarea {...control} rows={2} value={description} maxLength={DESCRIPTION_MAX} onChange={(event) => setDescription(event.target.value)} />
            )}
          </FormField>
        </div>
      </div>
      <CompositionConflictList conflicts={conflicts} />
      {formError !== null && (
        <Alert variant="error">
          {formError.message}
          {formError.editorLink && (
            <>
              {' '}
              <Link href={`/receitas/nova?${CART_QUERY}=1`} onClick={onDone} className={textLinkClassName()}>
                {texts.openEditor}
              </Link>
            </>
          )}
        </Alert>
      )}
    </form>
  );
}
