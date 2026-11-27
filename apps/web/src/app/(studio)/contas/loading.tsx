'use client';

import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';

/** SPEC 0007 section 5.9, "Carregando". */
export default function AccountsLoading() {
  const { common } = useWebMessages();
  return (
    <div className={layout.centered}>
      <Spinner size="md" label={common.boundaries.accounts.loading} />
    </div>
  );
}
