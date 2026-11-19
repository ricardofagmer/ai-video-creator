import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ScheduleListView, ScheduleView } from '@studio/shared/api';
import type { Printer } from '../output/printer.js';
import { type ScheduleGateway } from './schedule-gateway.js';
import { printScheduleStatus, scheduleStatusLine } from './schedule-status.js';

/*
 * SPEC 0006 section 5.7 and R3-AC-23: `studio status` prints "Agendamentos: N ativos, próximo
 * qua. 09:00, M perdidos (7 dias)". The gateway fake replaces the core list query.
 */

function scheduleView(overrides: Partial<ScheduleView>): ScheduleView {
  return {
    format: 1,
    scheduleId: '01JDA5Z8Q6M0N9Y7X4W3V2T1S0',
    title: 'Vídeo diário',
    status: 'active',
    statusSince: '2026-11-19T12:00:00.000Z',
    createdAt: '2026-11-19T12:00:00.000Z',
    updatedAt: '2026-11-19T12:00:00.000Z',
    createdBy: 'api',
    correlationId: null,
    recipeRef: 'demo-recipe@1',
    recurrence: { kind: 'daily', time: '09:00' },
    timezone: 'America/Sao_Paulo',
    briefMode: 'queue',
    costConsent: { perRunUsd: 3, acceptedAt: '2026-11-19T12:00:00.000Z' },
    briefs: [{ briefId: '01JDA5Z8Q6M0N9Y7X4W3V2BRF1', title: null, used: false, brief: null, references: null }],
    next: [],
    slots: [],
    missedLast7Days: 0,
    briefsRemaining: 1,
    worstCasePerMonthUsd: 93,
    ...overrides,
  };
}

function gatewayOf(list: () => Promise<ScheduleListView>): ScheduleGateway {
  return {
    list,
    show: () => Promise.reject(new Error('not used')),
    change: () => Promise.reject(new Error('not used')),
  };
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

describe('studio status: schedules line', () => {
  it('prints the next slot and the missed count (R3-AC-23)', async () => {
    const views: ScheduleListView = [
      // Wednesday 2026-11-25 09:00 in Sao Paulo (UTC-3); the sooner of the two active schedules.
      scheduleView({ scheduleId: '01JDA5Z8Q6M0N9Y7X4W3V2T1S1', next: ['2026-11-25T12:00:00.000Z', '2026-11-26T12:00:00.000Z'], missedLast7Days: 2 }),
      scheduleView({ scheduleId: '01JDA5Z8Q6M0N9Y7X4W3V2T1S2', next: ['2026-11-27T12:00:00.000Z'], missedLast7Days: 1 }),
      // Paused: no next slot counted as next, but its missed slots still count.
      scheduleView({ scheduleId: '01JDA5Z8Q6M0N9Y7X4W3V2T1S3', status: 'paused', next: [], missedLast7Days: 4 }),
    ];
    const printer = new RecordingPrinter();
    await printScheduleStatus({ gateway: gatewayOf(async () => views), printer, describeError: () => 'unused' });

    assert.deepEqual(printer.lines, ['Agendamentos: 2 ativos, próximo qua. 09:00, 7 perdidos (7 dias)']);
    assert.deepEqual(printer.errors, []);
  });

  it('shows the slot in its schedule time zone and uses singular forms', () => {
    // 2026-11-25T12:00Z is 07:00 in New York (UTC-5 in November).
    const line = scheduleStatusLine([scheduleView({ timezone: 'America/New_York', next: ['2026-11-25T12:00:00.000Z'], missedLast7Days: 1 })]);
    assert.equal(line, 'Agendamentos: 1 ativo, próximo qua. 07:00, 1 perdido (7 dias)');
  });

  it('says so when nothing is active or nothing exists', () => {
    assert.equal(scheduleStatusLine([scheduleView({ status: 'paused' })]), 'Agendamentos: 0 ativos, sem próximo horário, 0 perdidos (7 dias)');
    assert.equal(scheduleStatusLine([]), 'Agendamentos: nenhum');
  });

  it('turns a read failure into a warning on stderr, never a failed status', async () => {
    const printer = new RecordingPrinter();
    await printScheduleStatus({
      gateway: gatewayOf(() => Promise.reject(new Error('boom'))),
      printer,
      describeError: () => 'Banco de dados indisponível.',
    });
    assert.deepEqual(printer.lines, []);
    assert.deepEqual(printer.errors, ['Aviso: agendamentos não lidos. Banco de dados indisponível.']);
  });
});
