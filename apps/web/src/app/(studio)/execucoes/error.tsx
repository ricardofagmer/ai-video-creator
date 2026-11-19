'use client';

import { Button, ErrorState } from '@studio/ui';

interface RunListErrorProps {
  reset: () => void;
}

/** design/telas/07, "Erro": the failure is shown, never its stack or message. */
export default function RunListError({ reset }: RunListErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar as execuções"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
