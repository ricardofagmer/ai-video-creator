'use client';

import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';

/** design/telas/08, "Carregando". */
export default function RunLoading() {
  const { common } = useWebMessages();
  return (
    <div className={layout.centered}>
      <Spinner size="md" label={common.boundaries.run.loading} />
    </div>
  );
}
