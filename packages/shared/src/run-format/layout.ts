import { type CheckId, type ReviewSubject, type StageId } from './vocabulary';

/**
 * Layout of `runs/<runId>/` (ADR 0003 decision 3). Every path here is relative to the run folder
 * and uses `/`; `@studio/shared/run-files` joins them with the run folder and refuses escapes.
 */
export const runFileNames = {
  run: 'run.json',
  plan: 'plan.md',
  now: 'now.json',
  events: 'events.jsonl',
  /** Append-only "what left the machine" log, one line per external call (SPEC 0002 rev 3). */
  egress: 'egress.jsonl',
  control: 'control.json',
  approval: 'approval.json',
  watcherPid: 'watcher.pid',
  sessionsDir: 'sessions',
  checksDir: 'checks',
  stagesDir: 'stages',
  archiveDir: 'archive',
  finalVideo: 'final.mp4',
  manifest: 'manifest.json',
  cost: 'cost.json',
  qaDir: 'qa',
  qaSummary: 'qa/summary.json',
  qaMediaReview: 'qa/media-review.json',
  report: 'report.md',
  /**
   * Append-only "what left the machine" after approval: one line per studio upload event (SPEC 0007
   * section 4.3). Optional; a reader treats a missing file as empty, so `format` stays 1.
   */
  publications: 'publications.jsonl',
};

export interface StageLocation {
  stageNumber: number;
  stageId: StageId;
}

/** `NN-stageId`, two-digit stage number (eng-grafo `NN-assunto`). */
export function stageFolderName(location: StageLocation): string {
  return `${String(location.stageNumber).padStart(2, '0')}-${location.stageId}`;
}

/** Working folder of a stage: brief, input manifest and declared outputs. */
export function stageWorkPath(location: StageLocation, file?: string): string {
  const folder = `${runFileNames.stagesDir}/${stageFolderName(location)}`;
  return file === undefined ? folder : `${folder}/${file}`;
}

export function stageBriefPath(location: StageLocation): string {
  return stageWorkPath(location, 'brief.json');
}

export function stageInputManifestPath(location: StageLocation): string {
  return stageWorkPath(location, 'input-manifest.json');
}

/** Folder the `archive` step moves the brief, input manifest and evidence into. */
export function stageArchivePath(location: StageLocation): string {
  return `${runFileNames.archiveDir}/${stageFolderName(location)}`;
}

export interface CheckLocation extends StageLocation {
  checkId: CheckId;
  attempt: number;
}

export function checkResultPath(location: CheckLocation): string {
  return `${runFileNames.checksDir}/${stageFolderName(location)}/${location.checkId}-${location.attempt}.json`;
}

export function checkOutputPath(location: CheckLocation): string {
  return `${runFileNames.checksDir}/${stageFolderName(location)}/${location.checkId}-${location.attempt}.log`;
}

export function sessionStreamPath(sessionId: string): string {
  return `${runFileNames.sessionsDir}/${sessionId}.jsonl`;
}

export function reviewVerdictPath(subject: ReviewSubject): string {
  return `${runFileNames.qaDir}/review-${subject}.json`;
}
