import {
  Alert,
  Badge,
  Card,
  DescriptionList,
  EmptyState,
  buttonClassName,
  formatUsd,
  textLinkClassName,
  type DescriptionItem,
  type Locale,
} from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { formatDateTime } from '@/features/runs/run-labels';
import { ScheduleBriefList } from '@/features/schedules/components/ScheduleBriefList';
import { ScheduleControls } from '@/features/schedules/components/ScheduleControls';
import { ScheduleSlotTable } from '@/features/schedules/components/ScheduleSlotTable';
import { nextSlotText, recurrenceText, scheduleStatusTones } from '@/features/schedules/schedule-labels';
import styles from '@/features/schedules/schedules.module.css';
import { loadSchedule } from '@/features/schedules/schedules.server';
import { formatSlot } from '@/lib/i18n/format';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export const dynamic = 'force-dynamic';

interface SchedulePageProps {
  params: Promise<{ scheduleId: string }>;
}

export async function generateMetadata({ params }: SchedulePageProps): Promise<Metadata> {
  const { scheduleId } = await params;
  const schedule = await loadSchedule(scheduleId);
  const { t } = await getI18n();
  return { title: schedule === null ? t.schedules.detail.fallbackTitle : t.schedules.detail.titleOf(schedule.title) };
}

function detailItems(schedule: ScheduleView, t: WebMessages['schedules'], locale: Locale): DescriptionItem[] {
  const terms = t.detail.terms;
  return [
    { term: terms.recipe, description: schedule.recipeRef, mono: true },
    { term: terms.recurrence, description: recurrenceText(schedule.recurrence, t, locale) },
    { term: terms.timezone, description: schedule.timezone, mono: true },
    { term: terms.maxPerRun, description: formatUsd(schedule.costConsent.perRunUsd, locale) },
    { term: terms.maxPerMonth, description: formatUsd(schedule.worstCasePerMonthUsd, locale) },
    { term: terms.costAcceptedAt, description: formatDateTime(schedule.costConsent.acceptedAt, locale) },
    { term: terms.createdAt, description: formatDateTime(schedule.createdAt, locale) },
    { term: terms.statusSince(t.statuses[schedule.status]), description: formatDateTime(schedule.statusSince, locale) },
  ];
}

/** The next 5 slots; empty unless the schedule is active. */
function NextSlots({ schedule, t, locale }: { schedule: ScheduleView; t: WebMessages['schedules']; locale: Locale }): ReactElement {
  if (schedule.next.length === 0) return <p className="caption">{nextSlotText(schedule, t, locale)}</p>;
  return (
    <ol className={styles.slotList} aria-label={t.detail.nextSlots}>
      {schedule.next.map((slot) => (
        <li key={slot}>{formatSlot(slot, schedule.timezone, locale)}</li>
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
  const { t, locale } = await getI18n();
  const texts = t.schedules.detail;

  if (schedule === null) {
    return (
      <EmptyState
        title={texts.notFoundTitle}
        description={texts.notFoundDescription}
        action={
          <Link href="/agendamentos" className={buttonClassName({ variant: 'secondary' })}>
            {texts.backToList}
          </Link>
        }
      />
    );
  }

  return (
    <div className={layout.page}>
      <StudioHero
        variant="compact"
        eyebrow={t.common.heroEyebrows.schedules}
        glyph="calendar"
        back={
          <Link href="/agendamentos" className={textLinkClassName()}>
            {texts.back}
          </Link>
        }
        title={<span className={styles.plainText}>{schedule.title}</span>}
        meta={<Badge tone={scheduleStatusTones[schedule.status]}>{t.schedules.statuses[schedule.status]}</Badge>}
        description={`${nextSlotText(schedule, t.schedules, locale)} · ${t.schedules.missed(schedule.missedLast7Days)}`}
        actions={<ScheduleControls scheduleId={schedule.scheduleId} status={schedule.status} />}
      />
      {schedule.status === 'deleted' && <Alert variant="info">{texts.deleted}</Alert>}
      <Alert variant="info" title={t.schedules.safety}>
        {t.schedules.planGate}
      </Alert>
      <div className={layout.detailColumns}>
        <div className={layout.stackLarge}>
          <Card title={texts.recentSlots} description={texts.recentSlotsDescription}>
            <ScheduleSlotTable slots={schedule.slots} timezone={schedule.timezone} t={t.schedules} locale={locale} />
          </Card>
          <Card title={texts.briefQueue}>
            <ScheduleBriefList schedule={schedule} t={t.schedules.briefList} />
          </Card>
        </div>
        <div className={layout.stackLarge}>
          <Card title={texts.nextSlots}>
            <NextSlots schedule={schedule} t={t.schedules} locale={locale} />
          </Card>
          <Card title={texts.details}>
            <DescriptionList items={detailItems(schedule, t.schedules, locale)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
