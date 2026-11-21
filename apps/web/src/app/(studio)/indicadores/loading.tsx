import { Spinner } from '@studio/ui';
import layout from '@/features/common/layout.module.css';

export default function InsightsLoading() {
  return (
    <div className={layout.centered}>
      <Spinner size="md" label="Calculando os indicadores" />
    </div>
  );
}
