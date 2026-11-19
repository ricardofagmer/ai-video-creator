import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** design/telas/09, while the run files are read. */
export default function ReviewLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando a revisão" />
    </div>
  );
}
