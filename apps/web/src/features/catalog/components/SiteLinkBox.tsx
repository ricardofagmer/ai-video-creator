'use client';

import { Alert, FormField, Input, Label, TagInput, buttonClassName, textLinkClassName } from '@studio/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../catalog.module.css';
import { assetTagsProblemOf, tagsOfText } from '../asset-tags';
import { catalogHref } from '../catalog-query';
import { SITE_LINK_URL_MAX, SITE_NAME_MAX, SITE_OWNER_MAX, siteLinkDraftOf, siteLinkUrlFrom, siteTagsOf } from '../site-link-draft';

const FIELD_IDS = {
  link: 'site-link',
  name: 'site-nome',
  owner: 'site-responsavel',
  tags: 'site-tags',
} as const;

type FieldErrors = Partial<Record<'name' | 'owner' | 'tags', string>>;

interface SiteLinkBoxProps {
  /** The id from `?salvo=` after a save, already checked against the asset id rule; null otherwise. */
  savedAssetId: string | null;
}

/**
 * The Sites section's box (docs/specs/2026-11-23-site-analysis-design.md point 7): an `https:` page link,
 * shown by its host only, saved as a draft website reference whose only file holds the link. Nothing is
 * fetched here or by the server; the page is read only by a run's research stage.
 */
export function SiteLinkBox({ savedAssetId }: SiteLinkBoxProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.siteLink;
  const router = useRouter();
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  const [url, setUrl] = useState<URL | null>(null);
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function showLink(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = siteLinkUrlFrom(linkText);
    if (parsed === null) {
      setLinkError(texts.onlyHttps);
      setUrl(null);
      return;
    }
    setLinkError(undefined);
    setUrl(parsed);
    if (name.trim() === '') setName(parsed.hostname);
  }

  function clear(): void {
    setLinkText('');
    setLinkError(undefined);
    setUrl(null);
    setTagsText('');
    setFormError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (url === null) return;
    const errors: FieldErrors = {};
    if (name.trim() === '') errors.name = texts.nameRequired;
    if (owner.trim() === '') errors.owner = texts.ownerRequired;
    const tags = tagsOfText(tagsText);
    const tagsProblem = assetTagsProblemOf(siteTagsOf(tags));
    if (tagsProblem !== null) errors.tags = tagsProblem.type === 'invalid' ? texts.tagsInvalid(tagsProblem.tag) : texts.tooManyTags(tagsProblem.max);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    const draft = siteLinkDraftOf({ url, name, owner, tags });
    try {
      await browserStudioClient.createAsset({
        fields: { assetId: draft.assetId, kind: draft.kind, metadata: draft.metadata },
        content: { layout: 'file', file: draft.file },
      });
      const target = catalogHref({ section: 'sites' });
      router.push(`${target}${target.includes('?') ? '&' : '?'}salvo=${draft.assetId}`);
      clear();
      setSaving(false);
    } catch (error) {
      setFormError(describeApiError(error, t));
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="site-link-titulo" className={layout.stack}>
      <h2 id="site-link-titulo" className="heading-2">
        {texts.title}
      </h2>
      <form className={styles.linkForm} onSubmit={showLink} noValidate>
        <div className={styles.linkField}>
          <Label htmlFor={FIELD_IDS.link}>{texts.label}</Label>
          <Input
            id={FIELD_IDS.link}
            type="url"
            inputMode="url"
            maxLength={SITE_LINK_URL_MAX}
            placeholder={texts.placeholder}
            aria-describedby={`${FIELD_IDS.link}-ajuda`}
            invalid={linkError !== undefined}
            value={linkText}
            onChange={(event) => setLinkText(event.target.value)}
          />
        </div>
        <button type="submit" className={buttonClassName({ variant: 'primary' })}>
          {t.catalog.linkBox.submit}
        </button>
        {url !== null && (
          <button type="button" className={buttonClassName({ variant: 'ghost' })} onClick={clear}>
            {t.catalog.linkBox.clear}
          </button>
        )}
      </form>
      <p id={`${FIELD_IDS.link}-ajuda`} className="caption">
        {texts.help}
      </p>
      {linkError !== undefined && <Alert variant="warning">{linkError}</Alert>}
      {savedAssetId !== null && (
        <Alert variant="success">
          {texts.saved}{' '}
          <Link href={`/catalogo/${savedAssetId}`} className={textLinkClassName()}>
            {texts.openSaved}
          </Link>
        </Alert>
      )}
      {url !== null && (
        <div className={styles.linkPreview}>
          <p className="body-sm" role="status">
            {texts.host(url.hostname)}
          </p>
          <form className={styles.saveForm} onSubmit={save} noValidate>
            <FormField id={FIELD_IDS.name} label={texts.name} error={fieldErrors.name}>
              {(control) => <Input {...control} value={name} maxLength={SITE_NAME_MAX} onChange={(event) => setName(event.target.value)} />}
            </FormField>
            <FormField id={FIELD_IDS.owner} label={texts.owner} error={fieldErrors.owner}>
              {(control) => <Input {...control} value={owner} maxLength={SITE_OWNER_MAX} onChange={(event) => setOwner(event.target.value)} />}
            </FormField>
            <FormField id={FIELD_IDS.tags} label={texts.tags} help={texts.tagsHelp} error={fieldErrors.tags} optional disabled={saving}>
              {(control) => (
                <TagInput
                  {...control}
                  separator="comma"
                  removeLabel={t.common.tagInput.remove}
                  value={tagsText}
                  disabled={saving}
                  onChange={(next) => {
                    setTagsText(next);
                    setFieldErrors((current) => ({ ...current, tags: undefined }));
                  }}
                />
              )}
            </FormField>
            {formError !== null && <Alert variant="error">{formError}</Alert>}
            <button type="submit" className={buttonClassName({ variant: 'primary' })} disabled={saving} aria-busy={saving}>
              {saving ? texts.saving : texts.submit}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
