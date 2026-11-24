import { formatUsd, type Locale, type TimelinePhase, type TimelineStage, type TimelineStep } from '@studio/ui';
import {
  PhaseIdSchema,
  type NowFile,
  type RunFile,
  type RunStatus,
  type StageRecord,
  type StepRecord,
  type StepStatus,
} from '@studio/shared/run-format';
import { type WebMessages } from '@/messages';
import { formatDuration } from './run-labels';

/** The texts and locale the timeline labels are written in. */
export interface TimelineText {
  runs: WebMessages['runs'];
  locale: Locale;
}

function stepDetail(record: StepRecord, text: TimelineText): string | undefined {
  const parts: string[] = [];
  if (record.attempts > 1) parts.push(text.runs.timeline.attempts(record.attempts));
  const recoveries = record.recoveries.length;
  if (recoveries > 0) parts.push(text.runs.timeline.recoveries(recoveries));
  // Engine text (redacted, C3); rendered as React text only.
  if (record.detail !== '') parts.push(record.detail);
  return parts.length === 0 ? undefined : parts.join(', ');
}

function toTimelineStep(record: StepRecord, text: TimelineText): TimelineStep {
  return {
    id: record.step,
    label: text.runs.steps[record.step],
    status: record.status,
    detail: stepDetail(record, text),
    durationLabel: record.durationMs > 0 ? formatDuration(record.durationMs) : undefined,
  };
}

/** The worst step decides a stage that is not settled yet; a delivered stage is ok or warning. */
function stageStatus(stage: StageRecord, runIsRunning: boolean, isCursorStage: boolean): StepStatus {
  if (stage.outcome.status === 'skipped') return 'skipped';
  const statuses = stage.steps.map((step) => step.status);
  if (stage.outcome.status === 'delivered') return statuses.includes('warning') ? 'warning' : 'ok';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('running') || (runIsRunning && isCursorStage)) return 'running';
  return 'pending';
}

interface StageContext {
  run: RunFile;
  displayedStatus: RunStatus;
  text: TimelineText;
}

function toTimelineStage(stage: StageRecord, { run, displayedStatus, text }: StageContext): TimelineStage {
  const isCursorStage = run.cursor?.stageNumber === stage.number;
  return {
    id: stage.stageId,
    label: text.runs.stages[stage.stageId],
    status: stageStatus(stage, displayedStatus === 'running', isCursorStage),
    steps: stage.steps.map((record) => toTimelineStep(record, text)),
    costLabel: stage.costUsd > 0 || stage.outcome.status === 'delivered' ? formatUsd(stage.costUsd, text.locale) : undefined,
  };
}

/** run.json stages grouped by PRD 7.1 phase, in canonical order (design/telas/08). */
export function buildTimeline(run: RunFile, displayedStatus: RunStatus, text: TimelineText): TimelinePhase[] {
  const context: StageContext = { run, displayedStatus, text };
  return PhaseIdSchema.options
    .map((phaseId) => ({
      id: phaseId,
      label: text.runs.phases[phaseId],
      stages: run.stages.filter((stage) => stage.phaseId === phaseId).map((stage) => toTimelineStage(stage, context)),
    }))
    .filter((phase) => phase.stages.length > 0);
}

export interface TimelinePosition {
  stageId: string;
  stepId: string;
}

/** Where the run is: now.json while a watcher writes it, else the run's resume cursor. */
export function currentPosition(run: RunFile, now: NowFile | null): TimelinePosition | undefined {
  if (now !== null) return { stageId: now.stageId, stepId: now.step };
  if (run.cursor !== null) return { stageId: run.cursor.stageId, stepId: run.cursor.step };
  return undefined;
}
