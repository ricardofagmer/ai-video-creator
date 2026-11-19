import { lstat } from 'node:fs/promises';
import { curationDirectory, curationFilePath, type CurationLocation } from '@studio/shared/curation/files';
import { resolveInsideRun, runDirectory } from '@studio/shared/run-files';
import { SessionIdSchema, runFileNames, sessionStreamPath } from '@studio/shared/run-format';
import { mapTraceToOtlp, type TraceExport } from '@studio/shared/telemetry';
import { TraceExportError } from './trace-errors.js';
import { readLastLine, readSourceLines } from './source-lines.js';
import { type TraceSource } from './trace-source.js';

/** The data-home folders the export reads; it writes nothing in them. */
export interface TraceDataFolders {
  runs: string;
  curations: string;
}

/** Read bounds of the export. A run's events.jsonl is far below them; a larger file is refused. */
const traceReadBounds = {
  eventsBytes: 32 * 1_048_576,
  curationSessionBytes: 8 * 1_048_576,
  /** Distinct sessions of one run whose end line is read. */
  sessions: 500,
  /** The tail of a session stream read to find its `end` line. */
  sessionTailBytes: 65_536,
} as const;

type TraceTarget = { kind: 'run'; runId: string; runDir: string } | { kind: 'curation'; location: CurationLocation };

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) return false;
    throw error;
  }
}

/** Run and curation ids are both ULIDs; a run folder is looked up first, then a curation folder. */
async function resolveTarget(folders: TraceDataFolders, targetId: string): Promise<TraceTarget> {
  const runDir = runDirectory(folders.runs, targetId);
  if (await isDirectory(runDir)) return { kind: 'run', runId: targetId, runDir };
  const location: CurationLocation = { curationsRoot: folders.curations, curationId: targetId };
  if (await isDirectory(curationDirectory(location))) return { kind: 'curation', location };
  throw new TraceExportError('target-not-found', targetId);
}

function isEndLine(line: unknown): boolean {
  return typeof line === 'object' && line !== null && 'type' in line && line.type === 'end';
}

/** Session ids named by the events, in first-seen order; the mapper validates the events themselves. */
function sessionIdsOf(events: readonly unknown[]): string[] {
  const sessionIds = new Set<string>();
  for (const line of events) {
    if (typeof line !== 'object' || line === null || !('sessionId' in line)) continue;
    const parsed = SessionIdSchema.safeParse(line.sessionId);
    if (parsed.success) sessionIds.add(parsed.data);
  }
  return [...sessionIds];
}

async function loadRun(target: Extract<TraceTarget, { kind: 'run' }>, signal: AbortSignal): Promise<TraceExport> {
  const { runId, runDir } = target;
  const events = await readSourceLines({ filePath: resolveInsideRun(runDir, runFileNames.events), maxBytes: traceReadBounds.eventsBytes, targetId: runId, signal });
  const sessionIds = sessionIdsOf(events);
  if (sessionIds.length > traceReadBounds.sessions) throw new TraceExportError('source-too-large', runId);
  const sessionEnds: unknown[] = [];
  for (const sessionId of sessionIds) {
    signal.throwIfAborted();
    const last = await readLastLine(resolveInsideRun(runDir, sessionStreamPath(sessionId)), traceReadBounds.sessionTailBytes);
    // An unreadable last line is handed over as null, so the mapper counts it as unmapped.
    if (last.status === 'invalid') sessionEnds.push(null);
    else if (last.status === 'line' && isEndLine(last.value)) sessionEnds.push(last.value);
  }
  return mapTraceToOtlp({ kind: 'run', runId, events, sessionEnds });
}

async function loadCuration(location: CurationLocation, signal: AbortSignal): Promise<TraceExport> {
  const targetId = location.curationId;
  const events = await readSourceLines({ filePath: curationFilePath(location, 'events'), maxBytes: traceReadBounds.eventsBytes, targetId, signal });
  const sessionEnds = await readSourceLines({
    filePath: curationFilePath(location, 'session'),
    maxBytes: traceReadBounds.curationSessionBytes,
    targetId,
    signal,
    keep: isEndLine,
  });
  return mapTraceToOtlp({ kind: 'curation', curationId: targetId, events, sessionEnds });
}

/**
 * Production `TraceSource`: reads `runs/<id>/events.jsonl` and the end line of each session stream,
 * or `curations/<id>/events.jsonl` and the end lines of `session.jsonl`, through the shared C5 path
 * helpers (paths confined to the folder) and a bounded line reader that hands unreadable lines to the
 * mapper to count, then maps them. Read-only; no request of any kind.
 */
export function fileTraceSource(folders: TraceDataFolders): TraceSource {
  return {
    async load(targetId: string, signal: AbortSignal): Promise<TraceExport> {
      const target = await resolveTarget(folders, targetId);
      return target.kind === 'run' ? loadRun(target, signal) : loadCuration(target.location, signal);
    },
  };
}
