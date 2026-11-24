import { type Locale } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { CatalogFavoriteCount } from '@/features/favorites/components/CatalogFavoriteCount';
import { FavoriteFilterItem } from '@/features/favorites/components/FavoriteFilterItem';
import { FavoriteFilterSection } from '@/features/favorites/components/FavoriteFilterSection';
import { type WebMessages } from '@/messages';
import styles from '../catalog.module.css';
import { CatalogAssetItem } from './CatalogAssetItem';
import { CatalogLibraryTile } from './CatalogLibraryTile';

export interface CatalogGridGroup {
  id: string;
  /** Section heading; null for a single flat grid. */
  label: string | null;
  versions: readonly AssetVersionView[];
}

interface CatalogGroupedGridProps {
  groups: readonly CatalogGridGroup[];
  /** Sorted by score each version is its own card and links to that version. */
  byScore: boolean;
  t: WebMessages['catalog'];
  locale: Locale;
  /** `library`: small picture tiles (the Images section); `cards`: the full catalog cards. */
  appearance?: 'cards' | 'library';
}

function CardGrid({ versions, byScore, t, locale, headingLevel, appearance = 'cards' }: Omit<CatalogGroupedGridProps, 'groups'> & {
  versions: readonly AssetVersionView[];
  headingLevel: 'h2' | 'h3';
}): ReactElement {
  if (appearance === 'library') {
    return (
      <ul className={styles.libraryGrid}>
        {versions.map((version) => (
          <FavoriteFilterItem key={`${version.id}@${version.version}`} scope="catalog" id={version.id}>
            <CatalogLibraryTile version={version} linkToVersion={byScore} />
          </FavoriteFilterItem>
        ))}
      </ul>
    );
  }
  return (
    <ul className={layout.cardGrid}>
      {versions.map((version) => (
        <FavoriteFilterItem key={`${version.id}@${version.version}`} scope="catalog" id={version.id}>
          <CatalogAssetItem version={version} linkToVersion={byScore} t={t} locale={locale} headingLevel={headingLevel} />
        </FavoriteFilterItem>
      ))}
    </ul>
  );
}

/**
 * design/telas/02: the cards of the active tab, in one section per category, or one flat grid. Every card is
 * rendered on the server; the "only favorites" filter hides cards and empty groups after hydration.
 */
export function CatalogGroupedGrid({ groups, byScore, t, locale, appearance }: CatalogGroupedGridProps): ReactElement {
  const [only] = groups;
  if (groups.length === 1 && only !== undefined && only.label === null) {
    return <CardGrid versions={only.versions} byScore={byScore} t={t} locale={locale} headingLevel="h2" appearance={appearance} />;
  }
  return (
    <div className={layout.stackLarge}>
      {groups.map((group) => {
        const ids = group.versions.map((version) => version.id);
        return (
          <FavoriteFilterSection key={group.id} scope="catalog" ids={ids} labelledBy={group.id} className={layout.stack}>
            <div className={styles.groupHeading}>
              <h2 id={group.id} className="heading-2">
                {group.label}
              </h2>
              <CatalogFavoriteCount ids={ids} byScore={byScore} />
            </div>
            <CardGrid versions={group.versions} byScore={byScore} t={t} locale={locale} headingLevel="h3" appearance={appearance} />
          </FavoriteFilterSection>
        );
      })}
    </div>
  );
}
