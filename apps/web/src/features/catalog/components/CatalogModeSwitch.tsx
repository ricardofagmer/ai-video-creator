import { classNames } from '@studio/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { getI18n } from '@/lib/i18n/server';
import { catalogHref, type CatalogFilters, type CatalogMode } from '../catalog-query';
import styles from '../catalog.module.css';

const modes: readonly CatalogMode[] = ['words', 'meaning'];

/**
 * The two search modes of `/catalogo` (SPEC 0003 section 5.2, B10: separate modes, no blending), shown
 * under the search input as a segmented control with its own colours. Plain links in the URL; the
 * section, kind and status filters carry over, the typed text does not.
 */
export async function CatalogModeSwitch({ filters }: { filters: CatalogFilters }): Promise<ReactElement> {
  const { t } = await getI18n();
  return (
    <nav aria-label={t.catalog.modes.navigationLabel} className={styles.modeSwitch}>
      {modes.map((mode) => {
        const current = filters.mode === mode;
        return (
          <Link
            key={mode}
            href={catalogHref({ mode, section: filters.section, kind: filters.kind, status: filters.status })}
            aria-current={current ? 'page' : undefined}
            className={classNames(styles.modeOption, current && styles.modeOptionSelected)}
          >
            {t.catalog.modes[mode]}
          </Link>
        );
      })}
    </nav>
  );
}
