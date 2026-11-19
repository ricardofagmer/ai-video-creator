'use client';

import { Button, ErrorState } from '@studio/ui';

interface RecipesErrorProps {
  reset: () => void;
}

/** design/telas/05 and 06, "Erro": the failure is shown, never its stack or message. */
export default function RecipesError({ reset }: RecipesErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar as receitas"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
