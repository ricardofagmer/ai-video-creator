'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { rememberCatalogHref } from '../catalog-return';

/** Records the catalog list's current address so closing a modal returns to the same filters. */
export function RememberCatalogLocation(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (pathname !== '/catalogo') return;
    const query = searchParams.toString();
    rememberCatalogHref(query === '' ? pathname : `${pathname}?${query}`);
  }, [pathname, searchParams]);
  return null;
}
