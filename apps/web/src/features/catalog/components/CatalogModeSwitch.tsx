import { buttonClassName } from '@studio/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { catalogHref, type CatalogFilters, type CatalogMode } from '../catalog-query';

const modes: readonly { mode: CatalogMode; label: string }[] = [
  { mode: 'words', label: 'Por palavras' },
  { mode: 'meaning', label: 'Por significado' },
];

/**
 * The two search modes of `/catalogo` (SPEC 0003 section 5.2, B10: separate modes, no blending).
 * Plain links in the URL; the kind and status filters carry over, the typed text does not.
 */
export function CatalogModeSwitch({ filters }: { filters: CatalogFilters }): ReactElement {
  return (
    <nav aria-label="Modo de busca" className={layout.row}>
      {modes.map(({ mode, label }) => {
        const current = filters.mode === mode;
        return (
          <Link
            key={mode}
            href={catalogHref({ mode, kind: filters.kind, status: filters.status })}
            aria-current={current ? 'page' : undefined}
            className={buttonClassName({ variant: current ? 'primary' : 'secondary', size: 'sm' })}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
