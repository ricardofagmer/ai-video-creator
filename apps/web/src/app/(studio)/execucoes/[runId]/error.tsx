'use client';

import { Button, ErrorState } from '@studio/ui';

interface RunErrorProps {
  reset: () => void;
}

/** design/telas/08, "Erro": the failure is shown, never its stack or message. */
export default function RunError({ reset }: RunErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar a execução"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
