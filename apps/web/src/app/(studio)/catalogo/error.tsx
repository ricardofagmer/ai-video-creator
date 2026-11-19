'use client';

import { Button, ErrorState } from '@studio/ui';

interface CatalogErrorProps {
  reset: () => void;
}

/** design/telas/02 and 03, "Erro": the failure is shown, never its stack or message. */
export default function CatalogError({ reset }: CatalogErrorProps) {
  return (
    <ErrorState
      title="Não foi possível carregar o catálogo"
      action={
        <Button variant="secondary" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  );
}
