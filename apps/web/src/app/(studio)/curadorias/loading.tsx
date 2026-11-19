import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** SPEC 0005 section 5.9, "Carregando". */
export default function CurationsLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando a proposta do curador" />
    </div>
  );
}
