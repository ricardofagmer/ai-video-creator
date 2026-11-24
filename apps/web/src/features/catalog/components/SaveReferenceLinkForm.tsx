'use client';

import { Alert, FormField, Input, Select, buttonClassName } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { browserStudioClient } from '@/lib/api';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../catalog.module.css';
import { catalogHref } from '../catalog-query';
import {
  CUSTOM_CATEGORY_LABEL_MAX,
  customCategoriesCookie,
  customCategoryIdOf,
  type CustomCategory,
} from '../custom-categories';
import {
  REFERENCE_AUTHOR_MAX,
  REFERENCE_NAME_MAX,
  REFERENCE_OWNER_MAX,
  referenceLinkDraftOf,
} from '../reference-link-draft';
import { templateCategories, templateCategoryFrom, type CatalogCategory } from '../template-categories';
import { type VideoPost } from '../video-link';

const FIELD_IDS = {
  name: 'referencia-nome',
  category: 'referencia-categoria',
  newCategory: 'referencia-nova-categoria',
  owner: 'referencia-responsavel',
  author: 'referencia-autor',
} as const;

type FieldErrors = Partial<Record<'name' | 'owner', string>>;

interface SaveReferenceLinkFormProps {
  post: VideoPost;
  /** The categories this browser created before (custom-categories.ts), read from the cookie on the server. */
  initialCustomCategories: readonly CustomCategory[];
}

/**
 * "Save as reference" under the embed (docs/specs/2026-11-23-reference-link-save-and-categories-design.md).
 * The app has no server actions, so this posts through the same browser client as the New item form;
 * the api validates the metadata again. Only the parsed post reaches the stored link. "New category"
 * adds a category to this browser's list, selects it, and the saved item carries it as a tag.
 */
export function SaveReferenceLinkForm({ post, initialCustomCategories }: SaveReferenceLinkFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.linkBox.save;
  const builtInLabels = t.catalog.categories.templateTypes;
  const platformLabel = t.catalog.linkBox.platforms[post.platform];
  const router = useRouter();
  const [name, setName] = useState(texts.defaultName(platformLabel, post.id));
  const [category, setCategory] = useState<CatalogCategory>('other');
  const [customCategories, setCustomCategories] = useState<readonly CustomCategory[]>(initialCustomCategories);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryError, setNewCategoryError] = useState<string | undefined>(undefined);
  const [categoryStatus, setCategoryStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [author, setAuthor] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const newCategoryInputRef = useRef<HTMLInputElement>(null);
  const newCategoryButtonRef = useRef<HTMLButtonElement>(null);
  const focusReturnRef = useRef(false);

  useEffect(() => {
    if (creatingCategory) {
      newCategoryInputRef.current?.focus();
      return;
    }
    if (focusReturnRef.current) {
      focusReturnRef.current = false;
      newCategoryButtonRef.current?.focus();
    }
  }, [creatingCategory]);

  function closeNewCategory(): void {
    focusReturnRef.current = true;
    setCreatingCategory(false);
    setNewCategoryName('');
    setNewCategoryError(undefined);
  }

  function selectCategory(value: CatalogCategory, label: string): void {
    setCategory(value);
    setCategoryStatus(texts.categoryAdded(label));
    closeNewCategory();
  }

  function handleAddCategory(): void {
    const label = newCategoryName.trim().slice(0, CUSTOM_CATEGORY_LABEL_MAX);
    const builtIn = templateCategories.find((value) => builtInLabels[value].toLocaleLowerCase() === label.toLocaleLowerCase());
    if (label !== '' && builtIn !== undefined) {
      selectCategory(builtIn, builtInLabels[builtIn]);
      return;
    }
    const id = customCategoryIdOf(label);
    if (id === null) {
      setNewCategoryError(texts.categoryNameRequired);
      return;
    }
    const existing = customCategories.find((custom) => custom.id === id);
    if (existing === undefined) {
      const next = [...customCategories, { id, label }];
      setCustomCategories(next);
      document.cookie = customCategoriesCookie(next);
    }
    selectCategory(id, existing?.label ?? label);
  }

  function handleNewCategoryKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Enter adds the category instead of submitting the whole reference; Escape gives up on it.
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddCategory();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeNewCategory();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (name.trim() === '') errors.name = texts.nameRequired;
    if (owner.trim() === '') errors.owner = texts.ownerRequired;
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    const draft = referenceLinkDraftOf({ post, name, category, owner, author });
    try {
      await browserStudioClient.createAsset({
        fields: { assetId: draft.assetId, kind: draft.kind, metadata: draft.metadata },
        content: { layout: 'file', file: draft.file },
      });
      const target = catalogHref({ section: 'references', templateCategory: category });
      router.push(`${target}${target.includes('?') ? '&' : '?'}salvo=${draft.assetId}`);
    } catch (error) {
      setFormError(describeApiError(error, t));
      setSaving(false);
    }
  }

  // Built-in categories first, then the ones created here, with Other last as the catch-all.
  const categoryOptions = [
    ...templateCategories.filter((value) => value !== 'other').map((value) => ({ value, label: builtInLabels[value] })),
    ...customCategories.map((custom) => ({ value: custom.id, label: custom.label })),
    { value: 'other', label: builtInLabels.other },
  ];

  return (
    <form className={styles.saveForm} onSubmit={handleSubmit} noValidate aria-labelledby="referencia-salvar-titulo">
      <h3 id="referencia-salvar-titulo" className="heading-3">
        {texts.title}
      </h3>
      <FormField id={FIELD_IDS.name} label={texts.name} error={fieldErrors.name}>
        {(control) => (
          <Input {...control} value={name} maxLength={REFERENCE_NAME_MAX} onChange={(event) => setName(event.target.value)} />
        )}
      </FormField>
      <div className={styles.categoryRow}>
        <FormField id={FIELD_IDS.category} label={texts.category}>
          {(control) => (
            <Select
              {...control}
              options={categoryOptions}
              value={category}
              onChange={(event) => {
                setCategory(templateCategoryFrom(event.target.value) ?? 'other');
                setCategoryStatus('');
              }}
            />
          )}
        </FormField>
        <button
          ref={newCategoryButtonRef}
          type="button"
          className={buttonClassName({ variant: 'secondary', className: styles.categoryAddButton })}
          aria-label={texts.newCategory}
          title={texts.newCategory}
          aria-expanded={creatingCategory}
          aria-controls={FIELD_IDS.newCategory}
          onClick={() => {
            setCategoryStatus('');
            setCreatingCategory(true);
          }}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {creatingCategory && (
        <div className={styles.categoryCreate}>
          <FormField id={FIELD_IDS.newCategory} label={texts.newCategoryName} error={newCategoryError}>
            {(control) => (
              <Input
                {...control}
                ref={newCategoryInputRef}
                value={newCategoryName}
                maxLength={CUSTOM_CATEGORY_LABEL_MAX}
                onChange={(event) => setNewCategoryName(event.target.value)}
                onKeyDown={handleNewCategoryKeyDown}
              />
            )}
          </FormField>
          <button type="button" className={buttonClassName({ variant: 'secondary' })} onClick={handleAddCategory}>
            {texts.addCategory}
          </button>
          <button type="button" className={buttonClassName({ variant: 'ghost' })} onClick={closeNewCategory}>
            {texts.cancelCategory}
          </button>
        </div>
      )}
      <p role="status" className="caption">
        {categoryStatus}
      </p>
      <FormField id={FIELD_IDS.owner} label={texts.owner} error={fieldErrors.owner}>
        {(control) => (
          <Input {...control} value={owner} maxLength={REFERENCE_OWNER_MAX} onChange={(event) => setOwner(event.target.value)} />
        )}
      </FormField>
      <FormField id={FIELD_IDS.author} label={texts.author} help={texts.authorHint(post.platform)}>
        {(control) => (
          <Input {...control} value={author} maxLength={REFERENCE_AUTHOR_MAX} onChange={(event) => setAuthor(event.target.value)} />
        )}
      </FormField>
      {formError !== null && <Alert variant="error">{formError}</Alert>}
      <button type="submit" className={buttonClassName({ variant: 'primary' })} disabled={saving} aria-busy={saving}>
        {saving ? texts.saving : texts.submit}
      </button>
    </form>
  );
}
