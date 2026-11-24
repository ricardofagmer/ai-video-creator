'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface ReviewErrorProps {
  reset: () => void;
}

/** design/telas/09: the failure is shown, never its stack or message. */
export default function ReviewError({ reset }: ReviewErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.review.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
