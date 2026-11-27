'use client';

import { Button, ErrorState } from '@studio/ui';
import { useWebMessages } from '@/lib/i18n/client';

interface RecipesErrorProps {
  reset: () => void;
}

/** design/telas/05 and 06, "Erro": the failure is shown, never its stack or message. */
export default function RecipesError({ reset }: RecipesErrorProps) {
  const { common } = useWebMessages();
  return (
    <ErrorState
      title={common.boundaries.recipes.error}
      action={
        <Button variant="secondary" onClick={reset}>
          {common.retry}
        </Button>
      }
    />
  );
}
