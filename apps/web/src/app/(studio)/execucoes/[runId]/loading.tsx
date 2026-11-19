import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** design/telas/08, "Carregando". */
export default function RunLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando a execução" />
    </div>
  );
}
