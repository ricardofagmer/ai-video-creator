'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface CreateVideoErrorProps {
  reset: () => void;
}

/** The failure is shown, never its stack or message; the session draft survives the retry. */
export default function CreateVideoError({ reset }: CreateVideoErrorProps) {
  const { common, wizard } = useWebMessages();
  return (
    <ErrorState
      title={wizard.boundaries.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
