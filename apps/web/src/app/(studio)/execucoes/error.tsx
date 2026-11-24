'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface RunListErrorProps {
  reset: () => void;
}

/** design/telas/07, "Erro": the failure is shown, never its stack or message. */
export default function RunListError({ reset }: RunListErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.runs.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
