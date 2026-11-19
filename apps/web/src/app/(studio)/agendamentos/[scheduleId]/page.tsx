import { Alert, Badge, Card, DescriptionList, EmptyState, PageHeader, buttonClassName, formatUsd, textLinkClassName, type DescriptionItem } from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatDateTime } from '@/features/runs/run-labels';
import { ScheduleBriefList } from '@/features/schedules/components/ScheduleBriefList';
import { ScheduleControls } from '@/features/schedules/components/ScheduleControls';
import { ScheduleSlotTable } from '@/features/schedules/components/ScheduleSlotTable';
import {
  PLAN_GATE_TEXT,
  SCHEDULE_SAFETY_TEXT,
  formatSlot,
  missedText,
  nextSlotText,
  recurrenceText,
  scheduleStatusLabels,
  scheduleStatusTones,
} from '@/features/schedules/schedule-labels';
import styles from '@/features/schedules/schedules.module.css';
import { loadSchedule } from '@/features/schedules/schedules.server';

export const dynamic = 'force-dynamic';

interface SchedulePageProps {
  params: Promise<{ scheduleId: string }>;
}

export async function generateMetadata({ params }: SchedulePageProps): Promise<Metadata> {
  const { scheduleId } = await params;
  const schedule = await loadSchedule(scheduleId);
  return { title: schedule === null ? 'Agendamento' : `${schedule.title} · Agendamentos` };
}

function detailItems(schedule: ScheduleView): DescriptionItem[] {
  return [
    { term: 'Receita', description: schedule.recipeRef, mono: true },
    { term: 'Repetição', description: recurrenceText(schedule.recurrence) },
    { term: 'Fuso horário', description: schedule.timezone, mono: true },
    { term: 'Custo máximo por execução', description: formatUsd(schedule.costConsent.perRunUsd) },
    { term: 'Custo máximo por mês', description: formatUsd(schedule.worstCasePerMonthUsd) },
    { term: 'Custo aceito em', description: formatDateTime(schedule.costConsent.acceptedAt) },
    { term: 'Criado em', description: formatDateTime(schedule.createdAt) },
    { term: `${scheduleStatusLabels[schedule.status]} desde`, description: formatDateTime(schedule.statusSince) },
  ];
}

/** The next 5 slots; empty unless the schedule is active. */
function NextSlots({ schedule }: { schedule: ScheduleView }): ReactElement {
  if (schedule.next.length === 0) return <p className="caption">{nextSlotText(schedule)}</p>;
  return (
    <ol className={styles.slotList} aria-label="Próximos horários">
      {schedule.next.map((slot) => (
        <li key={slot}>{formatSlot(slot, schedule.timezone)}</li>
      ))}
    </ol>
  );
}

/**
 * SPEC 0006 section 5.7: `/agendamentos/[scheduleId]`, with the next 5 slots, the last 20 slot
 * lines, the brief queue, and pause, resume and delete. No control here approves a run, promotes
 * a version or publishes: fired runs wait at the plan gate and stop at review like any run.
 */
export default async function SchedulePage({ params }: SchedulePageProps) {
  const { scheduleId } = await params;
  const schedule = await loadSchedule(scheduleId);

  if (schedule === null) {
    return (
      <EmptyState
        title="Agendamento não encontrado"
        description="Ele pode ter sido digitado errado no endereço."
        action={
          <Link href="/agendamentos" className={buttonClassName({ variant: 'secondary' })}>
            Voltar aos agendamentos
          </Link>
        }
      />
    );
  }

  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/agendamentos" className={textLinkClassName()}>
            ← Agendamentos
          </Link>
        }
        title={<span className={styles.plainText}>{schedule.title}</span>}
        meta={<Badge tone={scheduleStatusTones[schedule.status]}>{scheduleStatusLabels[schedule.status]}</Badge>}
        description={`${nextSlotText(schedule)} · ${missedText(schedule.missedLast7Days)}`}
        actions={<ScheduleControls scheduleId={schedule.scheduleId} status={schedule.status} />}
      />
      {schedule.status === 'deleted' && <Alert variant="info">Este agendamento foi excluído. O histórico de horários continua aqui.</Alert>}
      <Alert variant="info" title={SCHEDULE_SAFETY_TEXT}>
        {PLAN_GATE_TEXT}
      </Alert>
      <div className={layout.detailColumns}>
        <div className={layout.stackLarge}>
          <Card title="Últimos horários" description="Horários perdidos enquanto o Mac dorme ficam registrados e não são repetidos.">
            <ScheduleSlotTable slots={schedule.slots} timezone={schedule.timezone} />
          </Card>
          <Card title="Fila de briefings">
            <ScheduleBriefList schedule={schedule} />
          </Card>
        </div>
        <div className={layout.stackLarge}>
          <Card title="Próximos horários">
            <NextSlots schedule={schedule} />
          </Card>
          <Card title="Detalhes">
            <DescriptionList items={detailItems(schedule)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
