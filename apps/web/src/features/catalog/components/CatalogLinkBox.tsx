import { Alert, Input, Label, buttonClassName, textLinkClassName } from '@studio/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { type WebMessages } from '@/messages';
import styles from '../catalog.module.css';
import { type CustomCategory } from '../custom-categories';
import { videoPostKey, type VideoLink } from '../video-link';
import { SaveReferenceLinkForm } from './SaveReferenceLinkForm';
import { VideoEmbed } from './VideoEmbed';

const LINK_INPUT_ID = 'catalogo-link';

interface CatalogLinkBoxProps {
  link: VideoLink;
  /** The id from `?salvo=` after a save, already checked against the asset id rule; null otherwise. */
  savedAssetId: string | null;
  /** Categories this browser created (custom-categories.ts), for the Save as reference form. */
  customCategories: readonly CustomCategory[];
  t: WebMessages['catalog']['linkBox'];
}

/**
 * The References section's link box (docs/specs/2026-11-23-catalog-sections-and-link-embed-design.md):
 * a plain GET form on `?link=`. A supported link shows the platform's own embed and the Save as reference
 * form; nothing is downloaded, saving keeps only the link, and "Clear" drops the link from the URL.
 */
export function CatalogLinkBox({ link, savedAssetId, customCategories, t }: CatalogLinkBoxProps): ReactElement {
  return (
    <section aria-labelledby="catalogo-link-titulo" className={layout.stack}>
      <h2 id="catalogo-link-titulo" className="heading-2">
        {t.title}
      </h2>
      <form method="get" action="/catalogo" className={styles.linkForm}>
        <div className={styles.linkField}>
          <Label htmlFor={LINK_INPUT_ID}>{t.label}</Label>
          <Input
            id={LINK_INPUT_ID}
            name="link"
            type="url"
            inputMode="url"
            required
            maxLength={500}
            placeholder={t.placeholder}
            aria-describedby={`${LINK_INPUT_ID}-ajuda`}
            invalid={link.status === 'unsupported'}
          />
        </div>
        <button type="submit" className={buttonClassName({ variant: 'primary' })}>
          {t.submit}
        </button>
        {link.status !== 'absent' && (
          <Link href="/catalogo" className={textLinkClassName()}>
            {t.clear}
          </Link>
        )}
      </form>
      <p id={`${LINK_INPUT_ID}-ajuda`} className="caption">
        {t.help}
      </p>
      {savedAssetId !== null && (
        <Alert variant="success">
          {t.save.saved}{' '}
          <Link href={`/catalogo/${savedAssetId}`} className={textLinkClassName()}>
            {t.save.openSaved}
          </Link>
        </Alert>
      )}
      {link.status === 'unsupported' && <Alert variant="warning">{t.unsupported}</Alert>}
      {link.status === 'supported' && (
        <div className={styles.linkPreview}>
          <VideoEmbed key={`embed:${videoPostKey(link.post)}`} post={link.post} title={t.embedTitle(t.platforms[link.post.platform], link.post.id)} />
          <SaveReferenceLinkForm key={`form:${videoPostKey(link.post)}`} post={link.post} initialCustomCategories={customCategories} />
        </div>
      )}
    </section>
  );
}
