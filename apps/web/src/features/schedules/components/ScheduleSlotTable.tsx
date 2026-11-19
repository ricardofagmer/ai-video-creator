import { Badge, Table, textLinkClassName, type TableColumn } from '@studio/ui';
import { type SlotLine } from '@studio/shared/schedules';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { formatSlotWithYear, slotLineText, slotResultTones } from '../schedule-labels';

interface ScheduleSlotTableProps {
  slots: readonly SlotLine[];
  timezone: string;
}

/**
 * The newest slot lines of `slots.jsonl` (SPEC 0006 section 5.7, at most 20): when the slot was,
 * what the watcher decided and, for a fired slot, the run it created. Missed slots are logged,
 * never replayed.
 */
export function ScheduleSlotTable({ slots, timezone }: ScheduleSlotTableProps): ReactElement {
  const columns: readonly TableColumn<SlotLine>[] = [
    { key: 'slot', header: 'Horário', rowHeader: true, render: (line) => formatSlotWithYear(line.slotAt, timezone) },
    { key: 'result', header: 'Resultado', render: (line) => <Badge tone={slotResultTones[line.result]}>{slotLineText(line)}</Badge> },
    {
      key: 'run',
      header: 'Execução',
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
      caption="Últimos horários"
      hideCaption
      columns={columns}
      rows={slots}
      rowKey={(line) => `${line.slotAt}|${line.decidedAt}`}
      emptyText="Nenhum horário chegou ainda."
    />
  );
}
