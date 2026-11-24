import { Alert, EmptyState, PageHeader } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import { scheduleBounds } from '@studio/shared/schedules';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { NewScheduleButton } from '@/features/schedules/components/NewScheduleButton';
import { ScheduleSummaryCard } from '@/features/schedules/components/ScheduleSummaryCard';
import { loadRunnableRecipes, loadSchedules } from '@/features/schedules/schedules.server';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.schedules.list.title };
}
export const dynamic = 'force-dynamic';

/**
 * SPEC 0006 section 5.7: `/agendamentos`, at most 10 schedules (never `deleted`), each with its next
 * slot and the slots missed in the last 7 days (R3-AC-23). "Novo agendamento" opens the create
 * dialog with both worst-case cost figures.
 */
export default async function SchedulesPage() {
  const [list, recipes] = await Promise.all([loadSchedules(), loadRunnableRecipes()]);
  const { t, locale } = await getI18n();
  const texts = t.schedules.list;
  const runnable: readonly RecipeVersionView[] = recipes.status === 'ready' ? recipes.recipes : [];
  const atLimit = list.status === 'ready' && list.schedules.length >= scheduleBounds.maxSchedules;
  const newButton = <NewScheduleButton recipes={runnable} atLimit={atLimit} />;

  return (
    <div className={layout.page}>
      <PageHeader title={texts.title} description={texts.description} actions={newButton} />
      <CreationNotice
        texts={texts}
        recipesFailed={recipes.status === 'failed'} noRecipes={recipes.status === 'ready' && runnable.length === 0} atLimit={atLimit} />
      {list.status === 'failed' ? (
        <Alert variant="warning">{texts.loadFailed(list.message)}</Alert>
      ) : list.schedules.length === 0 ? (
        <EmptyState
          title={texts.emptyTitle}
          description={texts.emptyDescription}
          action={newButton}
        />
      ) : (
        <ul className={layout.cardGrid}>
          {list.schedules.map((schedule) => (
            <li key={schedule.scheduleId}>
              <ScheduleSummaryCard schedule={schedule} t={t.schedules} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Why "Novo agendamento" is disabled, when it is. */
interface CreationNoticeProps {
  texts: WebMessages['schedules']['list'];
  recipesFailed: boolean;
  noRecipes: boolean;
  atLimit: boolean;
}

function CreationNotice({ texts, recipesFailed, noRecipes, atLimit }: CreationNoticeProps): ReactElement | null {
  if (atLimit) return <p className="caption">{texts.atLimit(scheduleBounds.maxSchedules)}</p>;
  if (recipesFailed) return <Alert variant="warning">{texts.recipesFailed}</Alert>;
  if (noRecipes) return <p className="caption">{texts.noRecipes}</p>;
  return null;
}
