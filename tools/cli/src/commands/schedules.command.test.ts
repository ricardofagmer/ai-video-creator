import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ScheduleListView, ScheduleView } from '@studio/shared/api';
import type { ScheduleId } from '@studio/shared/schedules';
import type { Printer } from '../output/printer.js';
import { type ScheduleChange, type ScheduleGateway } from '../schedules/schedule-gateway.js';
import { schedulesChangeCommand, schedulesListCommand, schedulesShowCommand } from './schedules.command.js';

/*
 * SPEC 0006 R3-07 and R3-AC-23: `studio schedules pause` then `list` shows the schedule paused.
 * The gateway fake stands in for the core handlers: it keeps the views in memory and applies a
 * change the way `PatchScheduleHandler` does (status, `statusSince`, no next slot unless active).
 * No SQLite, no data home, no network.
 */

const SCHEDULE_ID = '01JDA5Z8Q6M0N9Y7X4W3V2T1S0';
const RUN_ID = '01JDA60000000000000000RNN1';
const BRIEF_ID = '01JDA5Z8Q6M0N9Y7X4W3V2BRF1';
const NEXT_SLOT = '2026-11-25T12:00:00.000Z';

function scheduleView(overrides: Partial<ScheduleView> = {}): ScheduleView {
  return {
    format: 1,
    scheduleId: SCHEDULE_ID,
    title: 'Vídeo diário',
    status: 'active',
    statusSince: '2026-11-19T12:00:00.000Z',
    createdAt: '2026-11-19T12:00:00.000Z',
    updatedAt: '2026-11-19T12:00:00.000Z',
    createdBy: 'cli',
    correlationId: null,
    recipeRef: 'demo-recipe@1',
    recurrence: { kind: 'daily', time: '09:00' },
    timezone: 'America/Sao_Paulo',
    briefMode: 'queue',
    costConsent: { perRunUsd: 3, acceptedAt: '2026-11-19T12:00:00.000Z' },
    briefs: [{ briefId: BRIEF_ID, title: 'Primeiro', used: true, brief: null, references: null }],
    next: [NEXT_SLOT],
    slots: [
      { slotAt: '2026-11-18T12:00:00.000Z', decidedAt: '2026-11-18T12:00:05.000Z', result: 'fired', reasonId: null, runId: RUN_ID, briefId: BRIEF_ID },
      { slotAt: '2026-11-17T12:00:00.000Z', decidedAt: '2026-11-17T15:00:00.000Z', result: 'missed', reasonId: 'watcher-not-running', runId: null, briefId: null },
    ],
    missedLast7Days: 1,
    briefsRemaining: 0,
    worstCasePerMonthUsd: 93,
    ...overrides,
  };
}

class InMemoryScheduleGateway implements ScheduleGateway {
  readonly changes: { scheduleId: ScheduleId; change: ScheduleChange }[] = [];
  private readonly views = new Map<ScheduleId, ScheduleView>();

  constructor(views: readonly ScheduleView[]) {
    for (const view of views) this.views.set(view.scheduleId, view);
  }

  async list(): Promise<ScheduleListView> {
    return [...this.views.values()].filter((view) => view.status !== 'deleted');
  }

  async show(scheduleId: ScheduleId): Promise<ScheduleView> {
    const view = this.views.get(scheduleId);
    if (view === undefined) throw new Error('schedule-not-found');
    return view;
  }

  async change(scheduleId: ScheduleId, change: ScheduleChange): Promise<ScheduleView> {
    const current = await this.show(scheduleId);
    this.changes.push({ scheduleId, change });
    const status = change === 'pause' ? 'paused' : change === 'resume' ? 'active' : 'deleted';
    const next = status === 'active' ? [NEXT_SLOT] : [];
    const updated = { ...current, status, statusSince: '2026-11-19T13:00:00.000Z', next } satisfies ScheduleView;
    this.views.set(scheduleId, updated);
    return updated;
  }
}

class RecordingPrinter implements Printer {
  readonly lines: string[] = [];
  readonly errors: string[] = [];

  line(text = ''): void {
    this.lines.push(text);
  }

  error(text: string): void {
    this.errors.push(text);
  }
}

function rowOf(printer: RecordingPrinter, scheduleId: string): string {
  const row = printer.lines.find((line) => line.startsWith(scheduleId));
  assert.ok(row !== undefined, 'the schedule row is listed');
  return row;
}

describe('studio schedules', () => {
  it('pause then list shows the schedule paused (R3-AC-23)', async () => {
    const gateway = new InMemoryScheduleGateway([scheduleView()]);
    const printer = new RecordingPrinter();

    assert.equal(await schedulesChangeCommand('pause', SCHEDULE_ID, { gateway, dependencies: { printer } }), 0);
    assert.deepEqual(gateway.changes, [{ scheduleId: SCHEDULE_ID, change: 'pause' }]);
    assert.match(printer.lines[0] ?? '', /pausado/);

    const listed = new RecordingPrinter();
    assert.equal(await schedulesListCommand(gateway, { printer: listed }), 0);
    const row = rowOf(listed, SCHEDULE_ID);
    assert.match(row, /pausado/);
    assert.doesNotMatch(row, /ativo/);
    assert.deepEqual(listed.errors, []);
  });

  it('lists an active schedule with its next slot and missed count, and resume brings it back', async () => {
    const gateway = new InMemoryScheduleGateway([scheduleView({ status: 'paused', next: [] })]);
    await schedulesChangeCommand('resume', SCHEDULE_ID, { gateway, dependencies: { printer: new RecordingPrinter() } });

    const listed = new RecordingPrinter();
    await schedulesListCommand(gateway, { printer: listed });
    const row = rowOf(listed, SCHEDULE_ID);
    assert.match(row, /ativo/);
    assert.match(row, /qua\., 25\/11 09:00/);
    assert.match(row, /demo-recipe@1/);
  });

  it('a deleted schedule leaves the list', async () => {
    const gateway = new InMemoryScheduleGateway([scheduleView()]);
    const printer = new RecordingPrinter();
    await schedulesChangeCommand('delete', SCHEDULE_ID, { gateway, dependencies: { printer } });
    assert.match(printer.lines[0] ?? '', /excluído/);

    const listed = new RecordingPrinter();
    await schedulesListCommand(gateway, { printer: listed });
    assert.deepEqual(listed.lines, ['Nenhum agendamento. Crie um pelo web, em Agendamentos.']);
  });

  it('show prints slots, the brief queue and never the brief body', async () => {
    const gateway = new InMemoryScheduleGateway([scheduleView()]);
    const printer = new RecordingPrinter();
    assert.equal(await schedulesShowCommand(SCHEDULE_ID, gateway, { printer }), 0);
    const text = printer.lines.join('\n');
    assert.match(text, /Status: ativo/);
    assert.match(text, /todo dia às 09:00 \(America\/Sao_Paulo\)/);
    assert.match(text, new RegExp(`Disparada \\(execução ${RUN_ID}\\)`));
    assert.match(text, /Perdida: o Mac estava desligado ou em repouso/);
    assert.match(text, /Perdidas \(7 dias\): 1/);
    assert.match(text, new RegExp(`${BRIEF_ID}  usado`));
    assert.match(text, /Nada é publicado\./);
  });
});
