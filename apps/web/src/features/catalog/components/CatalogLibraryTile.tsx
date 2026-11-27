import { type AssetVersionView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { cartItemOf } from '@/features/cart/cart-item';
import { CartToggleButton } from '@/features/cart/components/CartToggleButton';
import { FavoriteToggleButton } from '@/features/favorites/components/FavoriteToggleButton';
import styles from '../catalog.module.css';
import { imageLinkOf } from '../image-link-draft';
import { storedImageHref } from '../stored-image';
import { CatalogPreviewHover } from './CatalogPreviewHover';

interface CatalogLibraryTileProps {
  version: AssetVersionView;
  linkToVersion: boolean;
}

/**
 * One small tile of the Images library: the picture, its name and the cart and favorite toggles. The full
 * card (score, usage, tags) stays on the asset page; the library is for finding a picture by sight.
 */
export function CatalogLibraryTile({ version, linkToVersion }: CatalogLibraryTileProps): ReactElement {
  const href = linkToVersion ? `/catalogo/${version.id}?versao=${version.version}` : `/catalogo/${version.id}`;
  const imageLink = imageLinkOf(version);
  // A linked image loads straight from the owner's link (CSP `img-src https:`); the server never fetches it.
  const source = imageLink?.href ?? storedImageHref(version);
  // AP-11: the purpose names the picture for screen readers; the hover popover shows it to sighted users.
  const purpose = version.purpose.trim();
  return (
    <div className={styles.libraryTile} data-preview-card>
      <Link href={href} className={styles.libraryThumb} tabIndex={-1} aria-hidden="true">
        {source !== null && (
          <img
            src={source}
            alt={purpose}
            width={160}
            height={160}
            loading="lazy"
            decoding="async"
            referrerPolicy={imageLink === null ? undefined : 'no-referrer'}
          />
        )}
      </Link>
      <Link href={href} className={styles.libraryName} title={version.name}>
        {version.name}
      </Link>
      <CatalogPreviewHover version={version} />
      <div className={styles.libraryActions}>
        <CartToggleButton item={cartItemOf(version)} iconOnly />
        <FavoriteToggleButton scope="catalog" id={version.id} name={version.name} />
      </div>
    </div>
  );
}
