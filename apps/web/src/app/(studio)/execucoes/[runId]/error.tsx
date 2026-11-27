'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface RunErrorProps {
  reset: () => void;
}

/** design/telas/08, "Erro": the failure is shown, never its stack or message. */
export default function RunError({ reset }: RunErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.run.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
