'use client';

import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';

/** design/telas/02 and 03, "Carregando". */
export default function CatalogLoading() {
  const { common } = useWebMessages();
  return (
    <div className={layout.centered}>
      <Spinner size="md" label={common.boundaries.catalog.loading} />
    </div>
  );
}
