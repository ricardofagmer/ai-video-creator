import { Badge, Table, textLinkClassName, type Locale, type TableColumn } from '@studio/ui';
import { type SlotLine } from '@studio/shared/schedules';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { formatSlotWithYear } from '@/lib/i18n/format';
import { type WebMessages } from '@/messages';
import { slotLineText, slotResultTones } from '../schedule-labels';

interface ScheduleSlotTableProps {
  slots: readonly SlotLine[];
  timezone: string;
  t: WebMessages['schedules'];
  locale: Locale;
}

/**
 * The newest slot lines of `slots.jsonl` (SPEC 0006 section 5.7, at most 20): when the slot was,
 * what the watcher decided and, for a fired slot, the run it created. Missed slots are logged,
 * never replayed.
 */
export function ScheduleSlotTable({ slots, timezone, t, locale }: ScheduleSlotTableProps): ReactElement {
  const texts = t.slotTable;
  const columns: readonly TableColumn<SlotLine>[] = [
    { key: 'slot', header: texts.slot, rowHeader: true, render: (line) => formatSlotWithYear(line.slotAt, timezone, locale) },
    { key: 'result', header: texts.result, render: (line) => <Badge tone={slotResultTones[line.result]}>{slotLineText(line, t)}</Badge> },
    {
      key: 'run',
      header: texts.run,
      render: (line) =>
        line.runId === null ? (
          '—'
        ) : (
          <Link href={`/execucoes/${encodeURIComponent(line.runId)}`} className={textLinkClassName()}>
            <span className="mono">{line.runId}</span>
          </Link>
        ),
    },
  ];
  return (
    <Table
      caption={texts.caption}
      hideCaption
      columns={columns}
      rows={slots}
      rowKey={(line) => `${line.slotAt}|${line.decidedAt}`}
      emptyText={texts.empty}
    />
  );
}
