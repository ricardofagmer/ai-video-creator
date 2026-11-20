import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type InvokerStatus } from '../actions/studio-invoker';
import { type ServiceStatus, type ShellState } from '../state/state-model';
import { formatSlot } from './format-slot';
import { buildIncompleteInstallationMenu, buildMenuModel, type MenuItemModel } from './menu-model';

/*
 * R3-AC-25.4: items labelled exactly "Iniciar", "Parar" and "Abrir estúdio", a next-schedule line
 * and a review-count line; the enabled rules hold for every service-state combination and while an
 * action is in flight. No item controls the watcher.
 */

const TIMEZONE = 'America/Sao_Paulo';
const SERVICE_STATES: readonly ServiceStatus[] = ['running', 'stopped', 'unknown'];
const ACTION_PHASES: ReadonlyArray<{ name: string; status: InvokerStatus }> = [
  { name: 'idle', status: { phase: 'idle', last: null } },
  { name: 'idle after a failure', status: { phase: 'idle', last: { action: 'start', outcome: { kind: 'failed', exitCode: 1 } } } },
  { name: 'starting', status: { phase: 'running', action: 'start' } },
  { name: 'stopping', status: { phase: 'running', action: 'stop' } },
  { name: 'start unresponsive', status: { phase: 'unresponsive', action: 'start' } },
];

function state(api: ServiceStatus, web: ServiceStatus): ShellState {
  return {
    watcher: 'alive',
    api,
    web,
    schedules: { status: 'ok', nextSlotAtMs: Date.parse('2026-11-25T12:00:00.000Z'), skipped: 0, truncated: false },
    reviews: { status: 'ok', count: 3, skipped: 0, truncated: false },
  };
}

function action(items: readonly MenuItemModel[], label: string): Extract<MenuItemModel, { kind: 'action' }> {
  const found = items.find((item): item is Extract<MenuItemModel, { kind: 'action' }> => item.kind === 'action' && item.label === label);
  assert.ok(found, `missing action ${label}`);
  return found;
}

function infoLabels(items: readonly MenuItemModel[]): string[] {
  return items.flatMap((item) => (item.kind === 'info' ? [item.label] : []));
}

describe('menu model (R3-AC-25.4)', () => {
  it('has the three spec labels verbatim, the next-schedule line and the review-count line', () => {
    const items = buildMenuModel({ state: state('running', 'running'), action: { phase: 'idle', last: null }, openAtLogin: false, timeZone: TIMEZONE });
    for (const label of ['Iniciar', 'Parar', 'Abrir estúdio']) action(items, label);
    const lines = infoLabels(items);
    assert.ok(lines.includes('Próxima execução agendada: qua., 25/11 09:00'));
    assert.ok(lines.includes('Em revisão: 3'));
    assert.ok(lines.includes('Watcher: ativo'));
    assert.ok(items.some((item) => item.kind === 'checkbox' && item.label === 'Abrir ao iniciar sessão' && !item.checked));
    action(items, 'Sair');
  });

  it('shows "Sem agendamentos ativos" when no schedule is active', () => {
    const base = state('stopped', 'stopped');
    const items = buildMenuModel({
      state: { ...base, schedules: { status: 'ok', nextSlotAtMs: null, skipped: 0, truncated: false } },
      action: { phase: 'idle', last: null },
      openAtLogin: true,
    });
    assert.ok(infoLabels(items).includes('Sem agendamentos ativos'));
  });

  for (const api of SERVICE_STATES) {
    for (const web of SERVICE_STATES) {
      for (const phase of ACTION_PHASES) {
        it(`enabled rules hold for api ${api}, web ${web}, ${phase.name}`, () => {
          const items = buildMenuModel({ state: state(api, web), action: phase.status, openAtLogin: false, timeZone: TIMEZONE });
          const inFlight = phase.status.phase !== 'idle';
          const stoppable = (status: ServiceStatus): boolean => status === 'running' || status === 'unknown';
          assert.equal(action(items, 'Iniciar').enabled, !inFlight && (api !== 'running' || web !== 'running'));
          assert.equal(action(items, 'Parar').enabled, !inFlight && (stoppable(api) || stoppable(web)));
          assert.equal(action(items, 'Abrir estúdio').enabled, web === 'running');
        });
      }
    }
  }

  it('reads "Iniciando..." or "Parando..." while an action runs', () => {
    const starting = buildMenuModel({ state: state('stopped', 'stopped'), action: { phase: 'running', action: 'start' }, openAtLogin: false });
    const stopping = buildMenuModel({ state: state('running', 'running'), action: { phase: 'running', action: 'stop' }, openAtLogin: false });
    assert.ok(infoLabels(starting).includes('Iniciando...'));
    assert.ok(infoLabels(stopping).includes('Parando...'));
  });

  it('gives the watcher no control: every action is one of the four known ids', () => {
    const items = buildMenuModel({ state: state('running', 'running'), action: { phase: 'idle', last: null }, openAtLogin: false });
    const ids = items.flatMap((item) => (item.kind === 'action' ? [item.id] : []));
    assert.deepEqual(ids, ['start', 'stop', 'open-studio', 'quit']);
  });

  it('shows one disabled line and "Sair" when the installation is incomplete', () => {
    const items = buildIncompleteInstallationMenu();
    assert.equal(infoLabels(items).length, 1);
    assert.deepEqual(
      items.flatMap((item) => (item.kind === 'action' ? [item.label] : [])),
      ['Sair'],
    );
  });

  it('formats a slot as weekday, day/month and 24-hour time in the given zone', () => {
    assert.equal(formatSlot(Date.parse('2026-11-25T12:00:00.000Z'), TIMEZONE), 'qua., 25/11 09:00');
  });
});
