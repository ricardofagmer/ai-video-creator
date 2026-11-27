'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface CurationsErrorProps {
  reset: () => void;
}

/** SPEC 0005 section 5.9, "Erro": the failure is shown, never its stack or message. */
export default function CurationsError({ reset }: CurationsErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.curations.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
