import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** design/telas/02 and 03, "Carregando". */
export default function CatalogLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando o catálogo" />
    </div>
  );
}
