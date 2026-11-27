'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface CatalogErrorProps {
  reset: () => void;
}

/** design/telas/02 and 03, "Erro": the failure is shown, never its stack or message. */
export default function CatalogError({ reset }: CatalogErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.catalog.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
