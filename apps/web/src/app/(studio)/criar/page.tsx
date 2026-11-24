import { EmptyState, PageHeader, StatusBadge, buttonClassName } from '@studio/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { loadReviewData } from '@/features/review/review-data.server';
import { WizardFlow } from '@/features/wizard/components/WizardFlow';
import { WizardProduction } from '@/features/wizard/components/WizardProduction';
import { WizardResult } from '@/features/wizard/components/WizardResult';
import { WizardStepList } from '@/features/wizard/components/WizardStepList';
import { loadWizardSetup } from '@/features/wizard/wizard-data.server';
import { runStepOf } from '@/features/wizard/wizard-steps';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.wizard.title };
}
export const dynamic = 'force-dynamic';

interface CreateVideoPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function Header({ texts }: { texts: WebMessages['wizard'] }): ReactElement {
  return <PageHeader title={texts.title} description={texts.description} />;
}

/** Steps 5 and 6 for `?execucao=<runId>`: the step follows the run's state, so a reload resumes there. */
async function RunSteps({ runId, startFailed, t }: { runId: string; startFailed: boolean; t: WebMessages }): Promise<ReactElement> {
  const data = await loadReviewData(runId);
  if (data.kind === 'missing') {
    return (
      <EmptyState
        title={t.wizard.production.notFound}
        action={
          <Link href="/criar" className={buttonClassName({ variant: 'secondary' })}>
            {t.wizard.production.createAnother}
          </Link>
        }
      />
    );
  }
  const step = runStepOf(data.state.run.state);
  return (
    <>
      <div className={layout.stack}>
        <WizardStepList current={step} texts={t.wizard} />
        <p className="caption">
          <StatusBadge kind="run" status={data.state.displayedStatus} /> {data.state.run.recipe.definition.name} ·{' '}
          <span className="mono">{runId}</span>
        </p>
      </div>
      {data.kind === 'ready' ? (
        <WizardResult runId={runId} data={data} texts={t.wizard.result} />
      ) : (
        <WizardProduction runId={runId} initialState={data.state} startFailed={startFailed} />
      )}
    </>
  );
}

/**
 * "Criar vídeo" (guided-creation spec section 5): `/criar` walks steps 0 to 4 in the browser;
 * `/criar?execucao=<runId>` shows the run's production and result. It sits beside "Nova
 * execução" and the recipe editor and reuses their pieces.
 */
export default async function CreateVideoPage({ searchParams }: CreateVideoPageProps) {
  const query = await searchParams;
  const { t, locale } = await getI18n();
  // Any `execucao` value means "show this run"; a malformed id reads as unknown, never as a fresh start.
  if (query.execucao !== undefined) {
    const runId = typeof query.execucao === 'string' ? query.execucao : '';
    return (
      <div className={layout.page}>
        <Header texts={t.wizard} />
        <RunSteps runId={runId} startFailed={query.aviso === 'inicio-falhou'} t={t} />
      </div>
    );
  }

  const { recipes, options } = await loadWizardSetup(locale);
  return (
    <div className={layout.page}>
      <Header texts={t.wizard} />
      {recipes.length === 0 ? (
        <EmptyState
          title={t.wizard.noRecipesTitle}
          description={t.wizard.noRecipesDescription}
          action={
            <Link href="/receitas/nova" className={buttonClassName({ variant: 'primary' })}>
              {t.wizard.newRecipe}
            </Link>
          }
        />
      ) : (
        <WizardFlow recipes={recipes} options={options} />
      )}
    </div>
  );
}
