'use client';

import { Badge, FormField, TagInput, buttonClassName } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { assetTagsProblemOf, metadataWithTagsOf, tagsOfText } from '../asset-tags';
import styles from '../catalog.module.css';

interface AssetTagEditorProps {
  version: AssetVersionView;
}

/**
 * The tags of a catalog version as chips, with an inline editor. A save is version N+1 as a draft
 * that keeps every other field and the content of the version shown.
 */
export function AssetTagEditor({ version }: AssetTagEditorProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.details.tagEditor;
  const router = useRouter();
  const pathname = usePathname();
  const baseText = version.tags.join(', ');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(baseText);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const id = `asset-tags-${version.id}`;

  function cancel(): void {
    setText(baseText);
    setError(undefined);
    setEditing(false);
  }

  async function save(): Promise<void> {
    const tags = tagsOfText(text);
    const problem = assetTagsProblemOf(tags);
    if (problem !== null) {
      setError(problem.type === 'invalid' ? texts.invalid(problem.tag) : texts.tooMany(problem.max));
      return;
    }
    if (tags.join(', ') === baseText) {
      cancel();
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const saved = await browserStudioClient.saveMetadataVersion(version.id, {
        fromVersion: version.version,
        metadata: metadataWithTagsOf(version, tags),
      });
      setEditing(false);
      router.replace(`${pathname}?versao=${saved.version}`);
      router.refresh();
    } catch (saveError) {
      setError(describeApiError(saveError, t));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className={styles.tagEditor}>
        {version.tags.length > 0 ? (
          <ul className={styles.posterTags} aria-label={t.catalog.details.tags}>
            {version.tags.map((tag) => (
              <li key={tag}>
                <Badge tone="neutral">{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <span className="caption">{texts.none}</span>
        )}
        <button type="button" className={buttonClassName({ variant: 'ghost', size: 'sm' })} onClick={() => setEditing(true)}>
          {texts.edit}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.tagEditorForm}>
      <FormField id={id} label={<span className="visually-hidden">{t.catalog.details.tags}</span>} help={texts.help} error={error} disabled={saving}>
        {(control) => (
          <TagInput
            {...control}
            separator="comma"
            removeLabel={t.common.tagInput.remove}
            value={text}
            disabled={saving}
            onChange={(next) => {
              setText(next);
              setError(undefined);
            }}
          />
        )}
      </FormField>
      <div className={styles.tagEditorActions}>
        <button type="button" className={buttonClassName({ variant: 'primary', size: 'sm' })} onClick={() => void save()} disabled={saving} aria-busy={saving}>
          {saving ? texts.saving : texts.save}
        </button>
        <button type="button" className={buttonClassName({ variant: 'secondary', size: 'sm' })} onClick={cancel} disabled={saving}>
          {texts.cancel}
        </button>
      </div>
    </div>
  );
}
