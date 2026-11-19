import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** design/telas/07, "Carregando". */
export default function RunsLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando as execuções" />
    </div>
  );
}
