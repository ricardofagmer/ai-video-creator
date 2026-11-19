import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

/** SPEC 0006 section 5.7, "Carregando". */
export default function SchedulesLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Carregando os agendamentos" />
    </div>
  );
}
