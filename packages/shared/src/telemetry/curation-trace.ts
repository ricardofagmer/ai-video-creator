import { type CurationId } from '../common/ids';
import { CURATOR_ROLE } from '../curation/constants';
import { CurationEventSchema, type CurationEvent } from '../curation/events';
import { type CurationCallOutcome, type CurationStatus } from '../curation/enums';
import { CurationSessionLineSchema, type CurationUsage } from '../curation/session';
import { otlpStatusCode, type OtlpStatusCode } from './otlp';
import { SpanTree, type AttributeCandidates, type MappedTrace, type SpanDraft } from './span-tree';

/** What the mapper read of one curation: raw lines, validated here so a line it cannot map is counted. */
export interface CurationTraceSource {
  curationId: CurationId;
  /** Parsed lines of `curations/<curationId>/events.jsonl`, in file order. */
  events: readonly unknown[];
  /** The `end` lines of `curations/<curationId>/session.jsonl`. */
  sessionEnds: readonly unknown[];
}

const ROOT_KEY = 'curation';
const SESSION_PREFIX = 'session:';
/** Every Curator call goes to one provider (RUN-FORMAT section 23, `cost.json` sessions). */
const CURATOR_PROVIDER_NAME = 'claude';

function callOutcomeCode(outcome: CurationCallOutcome): OtlpStatusCode {
  return outcome === 'failed' ? otlpStatusCode.error : otlpStatusCode.ok;
}

function curationStatusCode(status: CurationStatus): OtlpStatusCode {
  return status === 'failed' ? otlpStatusCode.error : otlpStatusCode.ok;
}

function tokenAttributes(tokens: CurationUsage | null): AttributeCandidates {
  if (tokens === null) return {};
  return {
    'studio.tokens.input': tokens.inputTokens,
    'studio.tokens.output': tokens.outputTokens,
    'studio.tokens.cache_read': tokens.cacheReadTokens,
    'studio.tokens.cache_write': tokens.cacheWriteTokens,
  };
}

/** Epoch milliseconds of an ISO-8601 instant, or null when the runtime cannot parse it (the line is then not mapped). */
function atMs(at: string): number | null {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : null;
}

class CurationTraceBuilder {
  readonly tree: SpanTree;
  private readonly root: SpanDraft;

  constructor(curationId: CurationId) {
    this.tree = new SpanTree(`curation:${curationId}`);
    this.root = this.tree.ensure(ROOT_KEY, { parentKey: null, name: 'curation' });
    this.root.attributes['studio.curation.id'] = curationId;
  }

  /** Step span of one Curator call attempt, the `curation:call:<attempt>` step of the cost index. */
  private callSpan(attempt: number, at: number): SpanDraft {
    const call = this.tree.ensure(`call:${attempt}`, { parentKey: ROOT_KEY, name: 'curation.call' });
    call.attributes['studio.curation.attempt'] = attempt;
    this.tree.touch(call, at);
    return call;
  }

  private sessionSpan(sessionId: string, attempt: number, at: number): SpanDraft {
    const call = this.callSpan(attempt, at);
    const session = this.tree.ensure(`${SESSION_PREFIX}${sessionId}`, { parentKey: call.key, name: 'curation.session' });
    Object.assign(session.attributes, { 'studio.session.id': sessionId, 'studio.session.role': CURATOR_ROLE, 'studio.provider.name': CURATOR_PROVIDER_NAME });
    this.tree.touch(session, at);
    return session;
  }

  /** False when the event's instant cannot be placed on the time line; the line is then not mapped. */
  add(event: CurationEvent): boolean {
    const at = atMs(event.at);
    if (at === null) return false;
    this.record(event, at);
    return true;
  }

  private record(event: CurationEvent, at: number): void {
    this.tree.touch(this.root, at);
    switch (event.type) {
      case 'curation.claimed':
        // The claiming pid is process detail, not on the allowlist.
        this.tree.addEvent(this.root, { atMs: at, name: 'curation.claimed', attributes: {} });
        return;
      case 'curation.collected':
        this.tree.addEvent(this.root, {
          atMs: at,
          name: 'curation.collected',
          attributes: {
            'studio.collected.runs': event.counts.runs,
            'studio.collected.notes': event.counts.notes,
            'studio.collected.evidence': event.counts.evidence,
            'studio.collected.declined': event.counts.declined,
          },
        });
        return;
      case 'curation.call.started': {
        const session = this.sessionSpan(event.sessionId, event.attempt, at);
        Object.assign(session.attributes, { 'studio.model.id': event.modelId, 'studio.instruction.version': event.instructionVersion });
        return;
      }
      case 'curation.call.ended': {
        const session = this.sessionSpan(event.sessionId, event.attempt, at);
        this.tree.touch(session, at - event.durationMs);
        Object.assign(session.attributes, {
          'studio.outcome': event.outcome,
          'studio.cost.usd': event.usd,
          'studio.duration.ms': event.durationMs,
          ...tokenAttributes(event.tokens),
        });
        session.status = callOutcomeCode(event.outcome);
        return;
      }
      case 'curation.check':
        this.tree.addEvent(this.callSpan(event.attempt, at), {
          atMs: at,
          name: 'curation.check',
          attributes: { 'studio.check.passed': event.passed, 'studio.check.failed': event.failed },
        });
        return;
      case 'curation.ended':
        this.tree.touch(this.root, at - event.durationMs);
        Object.assign(this.root.attributes, {
          'studio.curation.status': event.status,
          'studio.reason.id': event.reasonId,
          'studio.cost.usd': event.spentUsd,
          'studio.duration.ms': event.durationMs,
        });
        this.root.status = curationStatusCode(event.status);
        return;
    }
  }

  /** Returns the session id, or null for a line that is not an end line of a session the events named. */
  addSessionEnd(line: unknown): string | null {
    const parsed = CurationSessionLineSchema.safeParse(line);
    if (!parsed.success || parsed.data.type !== 'end') return null;
    const session = this.tree.get(`${SESSION_PREFIX}${parsed.data.sessionId}`);
    const at = atMs(parsed.data.at);
    if (session === undefined || at === null) return null;
    // Events carry the same numbers; the end line fills what an interrupted call left out.
    const fromEndLine: AttributeCandidates = {
      'studio.outcome': parsed.data.outcome,
      'studio.instruction.version': parsed.data.instructionVersion,
      ...tokenAttributes(parsed.data.usage),
    };
    for (const [key, value] of Object.entries(fromEndLine)) session.attributes[key] ??= value;
    if (session.status === otlpStatusCode.unset) session.status = callOutcomeCode(parsed.data.outcome);
    this.tree.touch(session, at);
    return parsed.data.sessionId;
  }

  finish(counts: { mappedLines: number; unmappedLines: number }): void {
    Object.assign(this.root.attributes, { 'studio.event.count': counts.mappedLines, 'studio.unmapped.count': counts.unmappedLines });
  }
}

/**
 * One curation as a span tree: curation > call attempt > Curator session (ADR 0006, RUN-FORMAT
 * section 23). The pid, prompt and output text and every field outside the allowlist stay out.
 */
export function mapCurationTrace(source: CurationTraceSource): MappedTrace {
  const builder = new CurationTraceBuilder(source.curationId);
  let mappedLines = 0;
  let unmappedLines = 0;
  for (const line of source.events) {
    const parsed = CurationEventSchema.safeParse(line);
    if (!parsed.success || parsed.data.curationId !== source.curationId || !builder.add(parsed.data)) {
      unmappedLines += 1;
      continue;
    }
    mappedLines += 1;
  }
  const endedSessions = new Set<string>();
  for (const line of source.sessionEnds) {
    const sessionId = builder.addSessionEnd(line);
    if (sessionId === null) {
      unmappedLines += 1;
      continue;
    }
    mappedLines += 1;
    endedSessions.add(sessionId);
  }
  builder.finish({ mappedLines, unmappedLines });
  const sessionsWithoutEnd = builder.tree.keysWithPrefix(SESSION_PREFIX).filter((sessionId) => !endedSessions.has(sessionId)).length;
  return { tree: builder.tree, mappedLines, unmappedLines, sessionsWithoutEnd };
}
