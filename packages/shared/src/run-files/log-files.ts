import { type SessionId } from '../common/ids';
import { RunEventSchema, type RunEvent } from '../run-format/events';
import { runFileNames, sessionStreamPath } from '../run-format/layout';
import { EgressEntrySchema, type EgressEntry } from '../run-format/manifest';
import { RunPublicationLineSchema, type RunPublicationLine } from '../run-format/publications';
import { SessionLineSchema, type SessionLine } from '../run-format/sessions';
import { appendJsonLine } from './atomic-write';
import { readJsonLines, type JsonLinesPage } from './read';
import { resolveInsideRun } from './run-paths';

/** Appends one event to `events.jsonl`; the file is never rewritten. */
export async function appendRunEvent(runDir: string, event: RunEvent): Promise<void> {
  await appendJsonLine(resolveInsideRun(runDir, runFileNames.events), RunEventSchema, event);
}

/** Events from a byte offset; pass the returned `nextByte` on the next poll. */
export async function readRunEvents(runDir: string, fromByte = 0, maxBytes?: number): Promise<JsonLinesPage<RunEvent>> {
  return readJsonLines(resolveInsideRun(runDir, runFileNames.events), RunEventSchema, fromByte, maxBytes);
}

/**
 * Appends one line to `sessions/<sessionId>.jsonl`. The caller passes already-redacted content;
 * this helper validates shape, not secrecy (redaction is the session-stream writer's job, R1-12).
 */
export async function appendSessionLine(runDir: string, line: SessionLine): Promise<void> {
  await appendJsonLine(resolveInsideRun(runDir, sessionStreamPath(line.sessionId)), SessionLineSchema, line);
}

export async function readSessionLines(
  runDir: string,
  sessionId: SessionId,
  fromByte = 0,
): Promise<JsonLinesPage<SessionLine>> {
  return readJsonLines(resolveInsideRun(runDir, sessionStreamPath(sessionId)), SessionLineSchema, fromByte);
}

/**
 * Appends one "what left the machine" line to `egress.jsonl` (SPEC 0002 rev 3), with the same
 * append-only discipline as `events.jsonl`. Call it for every external call, before the payload
 * leaves, so a crash never loses the record. The entry carries sizes, never content.
 */
export async function appendEgressEntry(runDir: string, entry: EgressEntry): Promise<void> {
  await appendJsonLine(resolveInsideRun(runDir, runFileNames.egress), EgressEntrySchema, entry);
}

/**
 * Egress lines from a byte offset. A run without `egress.jsonl` (written before rev 3, or with no
 * external call) reads as an empty page.
 */
export async function readEgressEntries(runDir: string, fromByte = 0): Promise<JsonLinesPage<EgressEntry>> {
  return readJsonLines(resolveInsideRun(runDir, runFileNames.egress), EgressEntrySchema, fromByte);
}

/**
 * Appends one line to `publications.jsonl` (SPEC 0007 sections 4.3 and 5.5). Watcher only, and only
 * for a run whose status is `approved`; the caller checks the status, as it does before any upload.
 * `upload-started` is appended before the first byte leaves, so a crash never loses the record.
 */
export async function appendRunPublicationLine(runDir: string, line: RunPublicationLine): Promise<void> {
  await appendJsonLine(resolveInsideRun(runDir, runFileNames.publications), RunPublicationLineSchema, line);
}

/**
 * Publication lines from a byte offset. A run without `publications.jsonl` (never published by the
 * studio, or written before SPEC 0007) reads as an empty page.
 */
export async function readRunPublicationLines(
  runDir: string,
  fromByte = 0,
  maxBytes?: number,
): Promise<JsonLinesPage<RunPublicationLine>> {
  return readJsonLines(resolveInsideRun(runDir, runFileNames.publications), RunPublicationLineSchema, fromByte, maxBytes);
}
