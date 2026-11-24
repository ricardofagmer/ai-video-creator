'use client';

import { Alert, FormField, Input, Label, Select, buttonClassName, textLinkClassName } from '@studio/ui';
import { type ImageDetails } from '@studio/shared/catalog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../catalog.module.css';
import { catalogHref } from '../catalog-query';
import { IMAGE_LINK_URL_MAX, IMAGE_NAME_MAX, IMAGE_OWNER_MAX, imageLinkDraftOf, imageLinkUrlFrom } from '../image-link-draft';
import { wikimediaFileUrlOf } from '../wikimedia-image-link';

const FIELD_IDS = {
  link: 'imagem-link',
  name: 'imagem-nome',
  owner: 'imagem-responsavel',
  purpose: 'imagem-uso',
} as const;

const purposes: readonly ImageDetails['purpose'][] = ['still', 'logo', 'background', 'cover', 'other'];

/** `fromPage`: the typed link was a Wikipedia image page and `url` is the image file behind it. */
type Preview =
  | { status: 'none' }
  | { status: 'loading'; url: URL; fromPage: boolean }
  | { status: 'loaded'; url: URL; fromPage: boolean; width: number; height: number }
  | { status: 'broken'; url: URL; fromPage: boolean };

type FieldErrors = Partial<Record<'name' | 'owner', string>>;

function purposeFrom(value: string): ImageDetails['purpose'] {
  return purposes.find((purpose) => purpose === value) ?? 'other';
}

interface ImageLinkBoxProps {
  /** The id from `?salvo=` after a save, already checked against the asset id rule; null otherwise. */
  savedAssetId: string | null;
}

/**
 * The Images section's box (docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md): an
 * `https:` image link shown as a thumbnail straight from the browser (the server never fetches it), then
 * saved as a draft image whose only file holds the link; or a file upload through the New item form.
 */
export function ImageLinkBox({ savedAssetId }: ImageLinkBoxProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.imageLink;
  const router = useRouter();
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<Preview>({ status: 'none' });
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [purpose, setPurpose] = useState<ImageDetails['purpose']>('still');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function showLink(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const typed = imageLinkUrlFrom(linkText);
    if (typed === null) {
      setLinkError(texts.onlyHttps);
      setPreview({ status: 'none' });
      return;
    }
    const file = wikimediaFileUrlOf(typed);
    setLinkError(undefined);
    setPreview({ status: 'loading', url: file ?? typed, fromPage: file !== null });
    if (name.trim() === '') setName(texts.defaultName);
  }

  function clear(): void {
    setLinkText('');
    setLinkError(undefined);
    setPreview({ status: 'none' });
    setFormError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (preview.status !== 'loaded') return;
    const errors: FieldErrors = {};
    if (name.trim() === '') errors.name = texts.nameRequired;
    if (owner.trim() === '') errors.owner = texts.ownerRequired;
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    const draft = imageLinkDraftOf({ url: preview.url, name, owner, purpose, width: preview.width, height: preview.height });
    try {
      await browserStudioClient.createAsset({
        fields: { assetId: draft.assetId, kind: draft.kind, metadata: draft.metadata },
        content: { layout: 'file', file: draft.file },
      });
      const target = catalogHref({ section: 'images' });
      router.push(`${target}${target.includes('?') ? '&' : '?'}salvo=${draft.assetId}`);
      clear();
      setSaving(false);
    } catch (error) {
      setFormError(describeApiError(error, t));
      setSaving(false);
    }
  }

  const purposeOptions = purposes.map((value) => ({ value, label: texts.purposes[value] }));

  return (
    <section aria-labelledby="imagem-link-titulo" className={layout.stack}>
      <h2 id="imagem-link-titulo" className="heading-2">
        {texts.title}
      </h2>
      <form className={styles.linkForm} onSubmit={showLink} noValidate>
        <div className={styles.linkField}>
          <Label htmlFor={FIELD_IDS.link}>{texts.label}</Label>
          <Input
            id={FIELD_IDS.link}
            type="url"
            inputMode="url"
            maxLength={IMAGE_LINK_URL_MAX}
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
        {preview.status !== 'none' && (
          <button type="button" className={buttonClassName({ variant: 'ghost' })} onClick={clear}>
            {t.catalog.linkBox.clear}
          </button>
        )}
        <Link href="/catalogo/novo?tipo=image" className={buttonClassName({ variant: 'secondary' })}>
          {texts.uploadFile}
        </Link>
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
      {preview.status !== 'none' && (
        <div className={styles.linkPreview}>
          <figure className={styles.imagePreview}>
            <img
              key={preview.url.href}
              src={preview.url.href}
              alt={texts.previewAlt}
              referrerPolicy="no-referrer"
              decoding="async"
              hidden={preview.status === 'broken'}
              onLoad={(event) => {
                const image = event.currentTarget;
                setPreview({
                  status: 'loaded',
                  url: preview.url,
                  fromPage: preview.fromPage,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                });
              }}
              onError={() => setPreview({ status: 'broken', url: preview.url, fromPage: preview.fromPage })}
            />
            <figcaption className="caption" role="status">
              {preview.status === 'loading' && texts.loading}
              {preview.status === 'loaded' && texts.size(preview.width, preview.height)}
              {preview.status === 'loaded' && preview.fromPage && ` · ${texts.fromWikimediaPage}`}
            </figcaption>
          </figure>
          {preview.status === 'broken' && <Alert variant="warning">{texts.broken}</Alert>}
          {preview.status === 'loaded' && (
            <form className={styles.saveForm} onSubmit={save} noValidate>
              <FormField id={FIELD_IDS.name} label={texts.name} error={fieldErrors.name}>
                {(control) => <Input {...control} value={name} maxLength={IMAGE_NAME_MAX} onChange={(event) => setName(event.target.value)} />}
              </FormField>
              <FormField id={FIELD_IDS.purpose} label={texts.purpose}>
                {(control) => (
                  <Select {...control} options={purposeOptions} value={purpose} onChange={(event) => setPurpose(purposeFrom(event.target.value))} />
                )}
              </FormField>
              <FormField id={FIELD_IDS.owner} label={texts.owner} error={fieldErrors.owner}>
                {(control) => <Input {...control} value={owner} maxLength={IMAGE_OWNER_MAX} onChange={(event) => setOwner(event.target.value)} />}
              </FormField>
              {formError !== null && <Alert variant="error">{formError}</Alert>}
              <button type="submit" className={buttonClassName({ variant: 'primary' })} disabled={saving} aria-busy={saving}>
                {saving ? texts.saving : texts.submit}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
