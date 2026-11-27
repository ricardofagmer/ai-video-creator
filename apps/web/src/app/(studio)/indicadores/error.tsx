'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface InsightsErrorProps {
  reset: () => void;
}

/** The failure is shown, never its stack or message. */
export default function InsightsError({ reset }: InsightsErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.insights.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
