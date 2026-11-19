import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** design/telas/05, "Carregando". */
export default function RecipesLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando as receitas" />
    </div>
  );
}
