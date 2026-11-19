import { Alert, EmptyState, PageHeader } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import { scheduleBounds } from '@studio/shared/schedules';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { NewScheduleButton } from '@/features/schedules/components/NewScheduleButton';
import { ScheduleSummaryCard } from '@/features/schedules/components/ScheduleSummaryCard';
import { loadRunnableRecipes, loadSchedules } from '@/features/schedules/schedules.server';

export const metadata: Metadata = { title: 'Agendamentos' };
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Execuções criadas sozinhas no horário escolhido. Cada uma espera a sua aprovação do plano e para na revisão; nada é publicado.';

/**
 * SPEC 0006 section 5.7: `/agendamentos`, at most 10 schedules (never `deleted`), each with its next
 * slot and the slots missed in the last 7 days (R3-AC-23). "Novo agendamento" opens the create
 * dialog with both worst-case cost figures.
 */
export default async function SchedulesPage() {
  const [list, recipes] = await Promise.all([loadSchedules(), loadRunnableRecipes()]);
  const runnable: readonly RecipeVersionView[] = recipes.status === 'ready' ? recipes.recipes : [];
  const atLimit = list.status === 'ready' && list.schedules.length >= scheduleBounds.maxSchedules;
  const newButton = <NewScheduleButton recipes={runnable} atLimit={atLimit} />;

  return (
    <div className={layout.page}>
      <PageHeader title="Agendamentos" description={DESCRIPTION} actions={newButton} />
      <CreationNotice recipesFailed={recipes.status === 'failed'} noRecipes={recipes.status === 'ready' && runnable.length === 0} atLimit={atLimit} />
      {list.status === 'failed' ? (
        <Alert variant="warning">{`Não foi possível carregar os agendamentos. ${list.message}`}</Alert>
      ) : list.schedules.length === 0 ? (
        <EmptyState
          title="Nenhum agendamento ainda"
          description="Escolha uma receita, os horários e uma fila de briefings. O estúdio prepara as execuções nos horários; você aprova o plano e revisa cada vídeo."
          action={newButton}
        />
      ) : (
        <ul className={layout.cardGrid}>
          {list.schedules.map((schedule) => (
            <li key={schedule.scheduleId}>
              <ScheduleSummaryCard schedule={schedule} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Why "Novo agendamento" is disabled, when it is. */
function CreationNotice({ recipesFailed, noRecipes, atLimit }: { recipesFailed: boolean; noRecipes: boolean; atLimit: boolean }): ReactElement | null {
  if (atLimit) return <p className="caption">{`Limite de ${scheduleBounds.maxSchedules} agendamentos. Exclua um para criar outro.`}</p>;
  if (recipesFailed) return <Alert variant="warning">Não foi possível carregar as receitas, então não dá para criar um agendamento agora.</Alert>;
  if (noRecipes) return <p className="caption">Crie uma receita em rascunho ou ativa antes de agendar execuções.</p>;
  return null;
}
