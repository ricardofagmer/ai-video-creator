'use client';

import { FormField, Input, Select, buttonClassName } from '@studio/ui';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../catalog.module.css';
import {
  CUSTOM_CATEGORY_LABEL_MAX,
  customCategoriesCookie,
  customCategoriesFromCookie,
  customCategoryIdOf,
  type CustomCategory,
} from '../custom-categories';
import {
  IMAGE_CATEGORIES_COOKIE,
  imageBuiltInCategories,
  imageCategoryFrom,
  imageCategoryLabelOf,
  imageCategoryNameOf,
  type ImageCategory,
} from '../image-categories';

interface ImageCategoryPickerProps {
  /** Prefix of the control ids, unique on the page. */
  idPrefix: string;
  value: ImageCategory;
  onChange: (category: ImageCategory) => void;
  /** The list the server read from the cookie; without it the picker reads the cookie itself. */
  initialCustomCategories?: readonly CustomCategory[];
  disabled?: boolean;
}

function cookieValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
}

/**
 * The image's category (docs/specs/2026-11-24-catalog-image-categories.md): the starter set, the ones
 * this browser created, and No category last. "+" opens a row to create one; it is selected at once and
 * its name is kept in this browser's image list, the same way Save as reference keeps its own list.
 */
export function ImageCategoryPicker({ idPrefix, value, onChange, initialCustomCategories, disabled = false }: ImageCategoryPickerProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.linkBox.save;
  const builtInLabels = t.catalog.categories.imageCategories;
  const [customCategories, setCustomCategories] = useState<readonly CustomCategory[]>(initialCustomCategories ?? []);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('');
  const newNameInputRef = useRef<HTMLInputElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const focusReturnRef = useRef(false);
  const ids = { category: `${idPrefix}-categoria`, newCategory: `${idPrefix}-nova-categoria` };

  // The upload form has no server read of the cookie, so the list comes from the browser after mount.
  useEffect(() => {
    if (initialCustomCategories === undefined) setCustomCategories(customCategoriesFromCookie(cookieValue(IMAGE_CATEGORIES_COOKIE)));
  }, [initialCustomCategories]);

  useEffect(() => {
    if (creating) {
      newNameInputRef.current?.focus();
      return;
    }
    if (focusReturnRef.current) {
      focusReturnRef.current = false;
      newButtonRef.current?.focus();
    }
  }, [creating]);

  function closeNewCategory(): void {
    focusReturnRef.current = true;
    setCreating(false);
    setNewName('');
    setNewNameError(undefined);
  }

  function select(category: ImageCategory, label: string): void {
    onChange(category);
    setStatus(texts.categoryAdded(label));
    closeNewCategory();
  }

  function handleAdd(): void {
    const label = newName.trim().slice(0, CUSTOM_CATEGORY_LABEL_MAX);
    const builtIn = imageBuiltInCategories.find(
      (category) => imageCategoryLabelOf(category, builtInLabels, new Map()).toLocaleLowerCase() === label.toLocaleLowerCase(),
    );
    if (label !== '' && builtIn !== undefined) {
      select(builtIn, imageCategoryLabelOf(builtIn, builtInLabels, new Map()));
      return;
    }
    const id = customCategoryIdOf(label);
    if (id === null) {
      setNewNameError(texts.categoryNameRequired);
      return;
    }
    // A typed name whose slug is a starter one ("people") is that starter category.
    if (imageCategoryNameOf(id) !== null) {
      select(id, imageCategoryLabelOf(id, builtInLabels, new Map()));
      return;
    }
    const existing = customCategories.find((custom) => custom.id === id);
    if (existing === undefined) {
      const next = [...customCategories, { id, label }];
      setCustomCategories(next);
      document.cookie = customCategoriesCookie(next, IMAGE_CATEGORIES_COOKIE);
    }
    select(id, existing?.label ?? label);
  }

  function handleNewNameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Enter adds the category instead of submitting the whole form; Escape gives up on it.
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAdd();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeNewCategory();
    }
  }

  const options = [
    ...imageBuiltInCategories.map((category) => ({ value: category, label: imageCategoryLabelOf(category, builtInLabels, new Map()) })),
    ...customCategories
      .filter((custom) => imageCategoryNameOf(custom.id) === null)
      .map((custom) => ({ value: custom.id, label: custom.label })),
    { value: 'other', label: builtInLabels.other },
  ];

  return (
    <div>
      <div className={styles.categoryRow}>
        <FormField id={ids.category} label={texts.category}>
          {(control) => (
            <Select
              {...control}
              disabled={disabled}
              options={options}
              value={value}
              onChange={(event) => {
                onChange(imageCategoryFrom(event.target.value) ?? 'other');
                setStatus('');
              }}
            />
          )}
        </FormField>
        <button
          ref={newButtonRef}
          type="button"
          className={buttonClassName({ variant: 'secondary', className: styles.categoryAddButton })}
          aria-label={texts.newCategory}
          title={texts.newCategory}
          aria-expanded={creating}
          aria-controls={ids.newCategory}
          disabled={disabled}
          onClick={() => {
            setStatus('');
            setCreating(true);
          }}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {creating && (
        <div className={styles.categoryCreate}>
          <FormField id={ids.newCategory} label={texts.newCategoryName} error={newNameError}>
            {(control) => (
              <Input
                {...control}
                ref={newNameInputRef}
                value={newName}
                maxLength={CUSTOM_CATEGORY_LABEL_MAX}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={handleNewNameKeyDown}
              />
            )}
          </FormField>
          <button type="button" className={buttonClassName({ variant: 'secondary' })} onClick={handleAdd}>
            {texts.addCategory}
          </button>
          <button type="button" className={buttonClassName({ variant: 'ghost' })} onClick={closeNewCategory}>
            {texts.cancelCategory}
          </button>
        </div>
      )}
      <p role="status" className="caption">
        {status}
      </p>
    </div>
  );
}
