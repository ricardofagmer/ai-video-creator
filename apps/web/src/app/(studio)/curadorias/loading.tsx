'use client';

import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';

/** SPEC 0005 section 5.9, "Carregando". */
export default function CurationsLoading() {
  const { common } = useWebMessages();
  return (
    <div className={layout.centered}>
      <Spinner size="md" label={common.boundaries.curations.loading} />
    </div>
  );
}
