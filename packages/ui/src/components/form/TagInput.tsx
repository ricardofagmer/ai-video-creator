'use client';

import { useState, type ClipboardEvent, type KeyboardEvent, type ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import { Icon } from '../icon/Icon';
import styles from './TagInput.module.css';

/** How the list is stored in the owner's text value: one item per line, or comma-separated. */
export type TagSeparator = 'line' | 'comma';

export interface TagInputProps {
  id: string;
  /** The stored text; items are read from and written back to it, so form models keep their format. */
  value: string;
  onChange: (value: string) => void;
  separator: TagSeparator;
  /** Accessible name of each badge's remove button, such as "Remover video maker". */
  removeLabel: (tag: string) => string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  'aria-describedby'?: string;
  'aria-required'?: true;
  className?: string;
}

const splitters: Record<TagSeparator, RegExp> = { line: /\r?\n/, comma: /[,\r\n]/ };
const joiners: Record<TagSeparator, string> = { line: '\n', comma: ', ' };

function tagsOf(text: string, separator: TagSeparator): string[] {
  return text
    .split(splitters[separator])
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

/**
 * Text field that turns each entry into a badge when the owner presses Enter (or types a comma
 * in a comma list). Backspace in an empty field takes the last badge back for editing.
 */
export function TagInput({
  id,
  value,
  onChange,
  separator,
  removeLabel,
  invalid = false,
  disabled = false,
  placeholder,
  className,
  ...aria
}: TagInputProps): ReactElement {
  const [draft, setDraft] = useState('');
  const tags = tagsOf(value, separator);

  function write(next: readonly string[]): void {
    onChange(next.join(joiners[separator]));
  }

  function commit(text: string): void {
    const added = tagsOf(text, separator).filter((tag) => !tags.includes(tag));
    if (added.length > 0) write([...tags, ...added]);
    setDraft('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' || (separator === 'comma' && event.key === ',')) {
      // Enter adds a badge instead of submitting the form.
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      event.preventDefault();
      setDraft(tags[tags.length - 1] ?? '');
      write(tags.slice(0, -1));
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    const text = event.clipboardData.getData('text');
    if (!splitters[separator].test(text)) return;
    event.preventDefault();
    commit(`${draft}${text}`);
  }

  return (
    <div className={classNames(styles.box, invalid && styles.invalid, disabled && styles.disabled, className)}>
      {tags.length > 0 && (
        <ul className={styles.tags}>
          {tags.map((tag) => (
            <li key={tag} className={styles.tag}>
              <span className={styles.tagText}>{tag}</span>
              <button
                type="button"
                className={styles.remove}
                disabled={disabled}
                aria-label={removeLabel(tag)}
                title={removeLabel(tag)}
                onClick={() => write(tags.filter((other) => other !== tag))}
              >
                <Icon name="close" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        {...aria}
        id={id}
        type="text"
        className={styles.input}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}
