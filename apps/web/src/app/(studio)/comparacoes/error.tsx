'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface ComparisonsErrorProps {
  reset: () => void;
}

/** SPEC 0003 section 5.3, "Erro": the failure is shown, never its stack or message. */
export default function ComparisonsError({ reset }: ComparisonsErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.comparisons.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
