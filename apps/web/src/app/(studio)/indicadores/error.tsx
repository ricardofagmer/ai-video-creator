'use client';

import { Button, ErrorState } from '@studio/ui';

interface InsightsErrorProps {
  reset: () => void;
}

/** The failure is shown, never its stack or message. */
export default function InsightsError({ reset }: InsightsErrorProps) {
  return (
    <ErrorState
      title="Não foi possível calcular os indicadores"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
