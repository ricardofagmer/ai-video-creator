import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** SPEC 0007 section 5.9, "Carregando". */
export default function AccountsLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando as contas" />
    </div>
  );
}
