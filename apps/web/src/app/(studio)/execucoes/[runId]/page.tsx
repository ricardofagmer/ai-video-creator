import { EmptyState, buttonClassName } from '@studio/ui';
import { type RunStateResponse } from '@studio/shared/api';
import { RunIdSchema } from '@studio/shared/run-format';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RunPublicationsCard } from '@/features/metrics/components/RunPublicationsCard';
import { loadRunPublications } from '@/features/metrics/run-publications.server';
import { RunPublishSection } from '@/features/publishing/components/RunPublishSection';
import { loadRunPublishData } from '@/features/publishing/run-publish.server';
import { RunLiveView, type ScheduleOrigin } from '@/features/runs/components/RunLiveView';
import { serverRunsApi } from '@/features/runs/runs-api.server';
import { loadScheduleTitle } from '@/features/schedules/schedules.server';
import { isNotFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface RunPageProps {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The run's live state, or null when the id is malformed or unknown. */
async function loadRunState(runId: string): Promise<RunStateResponse | null> {
  if (!RunIdSchema.safeParse(runId).success) return null;
  try {
    return await serverRunsApi().getRunState(runId);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** The schedule a watcher-created run came from (SPEC 0006 section 5.7), or null. */
async function loadScheduleOrigin(state: RunStateResponse): Promise<ScheduleOrigin | null> {
  const link = state.run.schedule;
  if (link === undefined) return null;
  return { scheduleId: link.scheduleId, title: await loadScheduleTitle(link.scheduleId) };
}

export async function generateMetadata({ params }: RunPageProps): Promise<Metadata> {
  const { runId } = await params;
  return { title: RunIdSchema.safeParse(runId).success ? `${runId} · Execuções` : 'Execuções' };
}

/**
 * design/telas/08: `/execucoes/[runId]`; the first state is read on the server, then polled. SPEC
 * 0006: "Criada pelo agendamento {título}" for a fired run, and "Publicações" for an approved run.
 * SPEC 0007 section 5.4: an approved run also gets the publish card and "O que saiu da máquina".
 */
export default async function RunPage({ params, searchParams }: RunPageProps) {
  const { runId } = await params;
  const query = await searchParams;
  const state = await loadRunState(runId);

  if (state === null) {
    return (
      <EmptyState
        title="Execução não encontrada"
        action={
          <Link href="/execucoes" className={buttonClassName({ variant: 'secondary' })}>
            Voltar às execuções
          </Link>
        }
      />
    );
  }

  // Publications are recorded on approved runs only (SPEC 0006 section 5.1); approval is final, so
  // the server decides once per load whether the card exists.
  const approved = state.run.state.status === 'approved';
  const [scheduleOrigin, publications, publish] = await Promise.all([
    loadScheduleOrigin(state),
    approved ? loadRunPublications(runId) : Promise.resolve(null),
    approved ? loadRunPublishData(runId) : Promise.resolve(null),
  ]);

  return (
    <RunLiveView
      runId={runId}
      initialState={state}
      startFailed={query.aviso === 'inicio-falhou'}
      scheduleOrigin={scheduleOrigin}
      footer={
        publications === null ? undefined : (
          <>
            {publish !== null && <RunPublishSection runId={runId} runTitle={state.run.title} data={publish} />}
            <RunPublicationsCard runId={runId} data={publications} />
          </>
        )
      }
    />
  );
}
