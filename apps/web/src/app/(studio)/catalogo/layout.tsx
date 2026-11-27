import type { ReactNode } from 'react';
import { RememberCatalogLocation } from '@/features/catalog/components/RememberCatalogLocation';

interface CatalogLayoutProps {
  children: ReactNode;
  /** Parallel route `@modal`: asset details and the asset form, opened over the list from the catalog. */
  modal: ReactNode;
}

export default function CatalogLayout({ children, modal }: CatalogLayoutProps) {
  return (
    <>
      <RememberCatalogLocation />
      {children}
      {modal}
    </>
  );
}
