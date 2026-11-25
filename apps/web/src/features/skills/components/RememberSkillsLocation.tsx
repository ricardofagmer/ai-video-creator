'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { rememberSkillsHref } from '../skills-return';

/** Records the Skills list's current address so closing a modal returns to the same category tab. */
export function RememberSkillsLocation(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    // Rendered only inside the catalog's Skills tab, so any catalog address here is the Skills list.
    if (pathname !== '/catalogo') return;
    // `salvo` is a one-time notice; going back to the list after a later close should not repeat it.
    const query = new URLSearchParams(searchParams.toString());
    query.delete('salvo');
    const text = query.toString();
    rememberSkillsHref(text === '' ? pathname : `${pathname}?${text}`);
  }, [pathname, searchParams]);
  return null;
}
