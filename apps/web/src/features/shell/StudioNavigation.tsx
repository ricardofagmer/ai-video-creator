'use client';

import { navLinkClassName } from '@studio/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

/**
 * design/telas/01: Catálogo · Receitas · Execuções; rev 3 (SPEC 0003 section 5.3) adds Comparações;
 * SPEC 0006 adds Agendamentos (section 5.7) and Métricas, the CSV import (section 5.9).
 */
const links = [
  { href: '/catalogo', label: 'Catálogo' },
  { href: '/receitas', label: 'Receitas' },
  { href: '/execucoes', label: 'Execuções' },
  { href: '/comparacoes', label: 'Comparações' },
  { href: '/agendamentos', label: 'Agendamentos' },
  { href: '/metricas/importar', label: 'Métricas' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioNavigation(): ReactElement {
  const pathname = usePathname();
  return (
    <>
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={navLinkClassName({ active })}>
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
