'use client';

import { Button, ErrorState } from '@studio/ui';

interface ReviewErrorProps {
  reset: () => void;
}

/** design/telas/09: the failure is shown, never its stack or message. */
export default function ReviewError({ reset }: ReviewErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar a revisão"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
