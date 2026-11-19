import { type RunState, type StageRecord } from '@studio/shared/run-format';
import { type RecentRuns, type RunReadResult, type RunSnapshot } from '../runs/run-reader.js';
import {
  RUN_STATUS_LABELS,
  STAGE_LABELS,
  STEP_LABELS,
  STEP_STATUS_LABELS,
  fitText,
  formatDuration,
  formatUsd,
} from './format.js';

/** Where the run stands: the cursor's stage, or the last stage when the run is past its cursor. */
export function currentStageLabel(snapshot: RunSnapshot): string {
  const cursor = snapshot.run.cursor;
  if (cursor === null) return '-';
  return `${cursor.stageNumber}/${snapshot.run.stages.length} ${STAGE_LABELS[cursor.stageId]}`;
}

export const RUN_LIST_HEADER = `${fitText('ID', 26)}  ${fitText('STATUS', 16)}  ${fitText('ETAPA', 22)}  ${fitText('CUSTO', 10)}  TÍTULO`;

/** One row of the run list; shared by `studio status` and the dashboard. */
export function runListRow(result: RunReadResult): string {
  if (result.status === 'unreadable') return `${fitText(result.runId, 26)}  ${fitText(`ilegível (${result.problem})`, 16)}`;
  const { snapshot } = result;
  return [
    fitText(snapshot.runId, 26),
    fitText(RUN_STATUS_LABELS[snapshot.displayedStatus], 16),
    fitText(currentStageLabel(snapshot), 22),
    fitText(formatUsd(snapshot.run.totals.costUsd), 10),
    snapshot.run.title,
  ].join('  ');
}

export function runListLines(recent: RecentRuns): string[] {
  const lines = [RUN_LIST_HEADER, ...recent.results.map(runListRow)];
  if (recent.results.length === 0) lines.push('Nenhuma execução ainda. Comece com "studio run".');
  else if (recent.total > recent.results.length) lines.push(`Mostrando ${recent.results.length} de ${recent.total} execuções.`);
  return lines;
}

/** The owner-facing reason and "what to do" of statuses that carry them (PRD 7.2, D16). */
export function stateNoteLines(state: RunState, runId: string): string[] {
  switch (state.status) {
    case 'waiting':
      return [`Motivo: ${state.reason}`, `O que fazer: ${state.whatToDo}`];
    case 'failed':
    case 'interrupted':
      return [`Motivo: ${state.reason}`, `Para continuar: studio resume ${runId}`];
    case 'paused':
      return [`Para continuar: studio resume ${runId}`];
    case 'review':
      return ['O vídeo está pronto para a revisão final no web.'];
    case 'approved':
    case 'rejected':
      return [`Decidido por: ${state.decidedBy}`];
    default:
      return [];
  }
}

const STAGE_OUTCOME_LABELS: Readonly<Record<StageRecord['outcome']['status'], string>> = {
  pending: 'pendente',
  delivered: 'entregue',
  skipped: 'pulada',
};

function stageLine(stage: StageRecord): string {
  const active = stage.steps.find((step) => step.status === 'running' || step.status === 'failed');
  const detail = active === undefined ? '' : ` (${STEP_LABELS[active.step]}: ${STEP_STATUS_LABELS[active.status]})`;
  return `  ${String(stage.number).padStart(2)} ${fitText(STAGE_LABELS[stage.stageId], 18)} ${STAGE_OUTCOME_LABELS[stage.outcome.status]}${detail}`;
}

export function runDetailLines(snapshot: RunSnapshot): string[] {
  const { run } = snapshot;
  const lines = [
    `Execução ${run.runId}: ${run.title}`,
    `Status: ${RUN_STATUS_LABELS[snapshot.displayedStatus]} desde ${run.state.since}`,
    ...stateNoteLines(run.state, run.runId),
    `Receita: ${run.recipe.ref}`,
    `Custo: ${formatUsd(run.totals.costUsd)} | Duração: ${formatDuration(run.totals.durationMs)} | Etapas entregues: ${run.totals.stagesDelivered}/${run.stages.length}`,
    `Watcher: ${snapshot.watcher.status === 'alive' ? `executando (pid ${snapshot.watcher.pid})` : 'nenhum ativo nesta execução'}`,
    'Etapas:',
    ...run.stages.map(stageLine),
  ];
  const now = snapshot.now;
  if (now !== null) {
    lines.push(`Agora: etapa ${now.stageNumber} ${STAGE_LABELS[now.stageId]}, ${STEP_LABELS[now.step]}, tentativa ${now.attempt}`);
    if (now.notice !== null) lines.push(`Aviso: ${now.notice}`);
    for (const activity of now.activities.slice(-5)) lines.push(`  · ${activity.text}`);
  }
  return lines;
}
