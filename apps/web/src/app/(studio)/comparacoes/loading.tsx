import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** SPEC 0003 section 5.3, "Carregando". */
export default function ComparisonsLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando as comparações" />
    </div>
  );
}
