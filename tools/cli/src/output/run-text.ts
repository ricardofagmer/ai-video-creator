import { type RunState, type StageRecord } from '@studio/shared/run-format';
import { cliText } from '../i18n/messages.js';
import { type RecentRuns, type RunReadResult, type RunSnapshot } from '../runs/run-reader.js';
import { fitText, formatDuration, formatUsd, runStatusLabel, stageLabel, stepLabel, stepStatusLabel } from './format.js';
import { stripTerminalControls } from './terminal-text.js';

/** Where the run stands: the cursor's stage, or the last stage when the run is past its cursor. */
export function currentStageLabel(snapshot: RunSnapshot): string {
  const cursor = snapshot.run.cursor;
  if (cursor === null) return '-';
  return `${cursor.stageNumber}/${snapshot.run.stages.length} ${stageLabel(cursor.stageId)}`;
}

/** The column header of the run list, in the active language. */
export function runListHeader(): string {
  const text = cliText().runs.list;
  return `${fitText(text.headerId, 26)}  ${fitText(text.headerStatus, 16)}  ${fitText(text.headerStage, 22)}  ${fitText(text.headerCost, 10)}  ${text.headerTitle}`;
}

function runListRowText(result: RunReadResult): string {
  if (result.status === 'unreadable') return `${fitText(result.runId, 26)}  ${fitText(cliText().runs.list.unreadable(result.problem), 16)}`;
  const { snapshot } = result;
  return [
    fitText(snapshot.runId, 26),
    fitText(runStatusLabel(snapshot.displayedStatus), 16),
    fitText(currentStageLabel(snapshot), 22),
    fitText(formatUsd(snapshot.run.totals.costUsd), 10),
    snapshot.run.title,
  ].join('  ');
}

/**
 * One row of the run list; shared by `studio status` and the dashboard. Titles are owner or model
 * text, so the row leaves here without terminal controls whichever screen prints it.
 */
export function runListRow(result: RunReadResult): string {
  return stripTerminalControls(runListRowText(result));
}

/** The line under the list when only the newest runs are shown; null when all are. */
export function runListMoreLine(recent: RecentRuns): string | null {
  return recent.total > recent.results.length ? cliText().runs.list.showing(recent.results.length, recent.total) : null;
}

export function runListLines(recent: RecentRuns): string[] {
  const lines = [runListHeader(), ...recent.results.map(runListRow)];
  const more = runListMoreLine(recent);
  if (recent.results.length === 0) lines.push(cliText().runs.list.empty);
  else if (more !== null) lines.push(more);
  return lines;
}

/**
 * The owner-facing reason and "what to do" of statuses that carry them (PRD 7.2, D16). The reason
 * and what-to-do texts are recorded by the watcher in run.json and are shown as recorded.
 */
export function stateNoteLines(state: RunState, runId: string): string[] {
  const text = cliText().runs.detail;
  switch (state.status) {
    case 'waiting':
      return [text.reason(state.reason), text.whatToDo(state.whatToDo)];
    case 'failed':
    case 'interrupted':
      return [text.reason(state.reason), text.toContinue(runId)];
    case 'paused':
      return [text.toContinue(runId)];
    case 'review':
      return [text.reviewReady];
    case 'approved':
    case 'rejected':
      return [text.decidedBy(state.decidedBy)];
    default:
      return [];
  }
}

function stageLine(stage: StageRecord): string {
  const active = stage.steps.find((step) => step.status === 'running' || step.status === 'failed');
  const detail = active === undefined ? '' : ` (${stepLabel(active.step)}: ${stepStatusLabel(active.status)})`;
  const outcome = cliText().runs.stageOutcomes[stage.outcome.status];
  return `  ${String(stage.number).padStart(2)} ${fitText(stageLabel(stage.stageId), 18)} ${outcome}${detail}`;
}

/**
 * The detail lines of one run, shared by `studio status <runId>` and the dashboard. Titles,
 * reasons, notices and activity lines come from agents and files, so every line leaves here
 * without terminal controls.
 */
export function runDetailLines(snapshot: RunSnapshot): string[] {
  return runDetailLineTexts(snapshot).map(stripTerminalControls);
}

function runDetailLineTexts(snapshot: RunSnapshot): string[] {
  const { run } = snapshot;
  const text = cliText().runs.detail;
  const lines = [
    text.heading(run.runId, run.title),
    text.status(runStatusLabel(snapshot.displayedStatus), run.state.since),
    ...stateNoteLines(run.state, run.runId),
    text.recipe(run.recipe.ref),
    text.totals(formatUsd(run.totals.costUsd), formatDuration(run.totals.durationMs), run.totals.stagesDelivered, run.stages.length),
    snapshot.watcher.status === 'alive' ? text.watcherAlive(snapshot.watcher.pid) : text.watcherNone,
    text.stagesHeading,
    ...run.stages.map(stageLine),
  ];
  const now = snapshot.now;
  if (now !== null) {
    lines.push(text.now(now.stageNumber, stageLabel(now.stageId), stepLabel(now.step), now.attempt));
    if (now.notice !== null) lines.push(text.notice(now.notice));
    for (const activity of now.activities.slice(-5)) lines.push(`  · ${activity.text}`);
  }
  return lines;
}
