'use client';

import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';

/** "Criar vídeo" while the recipes, catalog options or run are read on the server. */
export default function CreateVideoLoading() {
  const { wizard } = useWebMessages();
  return (
    <div className={layout.centered}>
      <Spinner size="md" label={wizard.boundaries.loading} />
    </div>
  );
}
