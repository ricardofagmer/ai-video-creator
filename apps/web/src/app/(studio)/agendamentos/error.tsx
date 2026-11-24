'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface SchedulesErrorProps {
  reset: () => void;
}

/** SPEC 0006 section 5.7, "Erro": the failure is shown, never its stack or message. */
export default function SchedulesError({ reset }: SchedulesErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.schedules.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
