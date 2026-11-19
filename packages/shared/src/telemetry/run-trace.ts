import { type RunId } from '../common/ids';
import { RunEventSchema, type RunEvent } from '../run-format/events';
import { SessionLineSchema } from '../run-format/sessions';
import { parseStepKey } from '../run-format/step-key';
import { reservedGateIds, type RunStatus, type StepStatus } from '../run-format/vocabulary';
import { otlpStatusCode, type OtlpStatusCode } from './otlp';
import { SpanTree, type AttributeCandidates, type MappedTrace, type SpanDraft } from './span-tree';

/** What the mapper read of one run: raw lines, validated here so a line it cannot map is counted, not fatal. */
export interface RunTraceSource {
  runId: RunId;
  /** Parsed lines of `runs/<runId>/events.jsonl`, in file order. */
  events: readonly unknown[];
  /** The `end` line of each `sessions/<sessionId>.jsonl` that has one. */
  sessionEnds: readonly unknown[];
}

const ROOT_KEY = 'run';
const SESSION_PREFIX = 'session:';

/** Recipe gate ids are recipe-defined names; only the two reserved gates are exported by name. */
const RECIPE_GATE_NAME = 'recipe-gate';

function stepStatusCode(status: StepStatus): OtlpStatusCode {
  if (status === 'ok' || status === 'warning') return otlpStatusCode.ok;
  return status === 'failed' ? otlpStatusCode.error : otlpStatusCode.unset;
}

function runStatusCode(status: RunStatus | null): OtlpStatusCode {
  if (status === 'failed') return otlpStatusCode.error;
  return status === 'review' || status === 'approved' || status === 'rejected' ? otlpStatusCode.ok : otlpStatusCode.unset;
}

function gateName(gate: string): string {
  return reservedGateIds.includes(gate) ? gate : RECIPE_GATE_NAME;
}

function recoveryOutcome(event: Extract<RunEvent, { type: 'step.recovery' }>): string {
  if (event.needsPerson) return 'needs-person';
  return event.resolved ? 'resolved' : 'unresolved';
}

class RunTraceBuilder {
  readonly tree: SpanTree;
  private readonly root: SpanDraft;
  private finalStatus: RunStatus | null = null;
  private correlationId: string | null = null;
  private logs = 0;
  private checks = 0;
  private recoveries = 0;

  constructor(private readonly runId: RunId) {
    this.tree = new SpanTree(`run:${runId}`);
    this.root = this.tree.ensure(ROOT_KEY, { parentKey: null, name: 'run' });
  }

  /** The step span of `stepKey` (creating its stage span first), or the run span when there is none. */
  private spanFor(stepKey: string | null, atMs: number): SpanDraft {
    this.tree.touch(this.root, atMs);
    if (stepKey === null) return this.root;
    const { stageId, step, attempt } = parseStepKey(stepKey);
    const stage = this.tree.ensure(`stage:${stageId}`, { parentKey: ROOT_KEY, name: `stage ${stageId}` });
    stage.attributes['studio.stage.id'] = stageId;
    this.tree.touch(stage, atMs);
    const stepSpan = this.tree.ensure(`step:${stepKey}`, { parentKey: stage.key, name: `step ${stageId}:${step}` });
    Object.assign(stepSpan.attributes, { 'studio.step.key': stepKey, 'studio.stage.id': stageId, 'studio.step.name': step, 'studio.step.attempt': attempt });
    this.tree.touch(stepSpan, atMs);
    return stepSpan;
  }

  private sessionSpan(event: Extract<RunEvent, { type: 'session.started' | 'session.ended' }>): SpanDraft {
    const parent = this.spanFor(event.stepKey, event.atMs);
    const session = this.tree.ensure(`${SESSION_PREFIX}${event.sessionId}`, { parentKey: parent.key, name: `session ${event.role}` });
    Object.assign(session.attributes, { 'studio.session.id': event.sessionId, 'studio.session.role': event.role, 'studio.model.id': event.modelId });
    this.tree.touch(session, event.atMs);
    return session;
  }

  private spanEvent(event: RunEvent, name: string, attributes: AttributeCandidates): void {
    this.tree.addEvent(this.spanFor(event.stepKey, event.atMs), { atMs: event.atMs, name, attributes });
  }

  add(event: RunEvent): void {
    this.correlationId ??= event.correlationId;
    switch (event.type) {
      case 'log':
        // The text is never exported; a log line only counts.
        this.spanFor(event.stepKey, event.atMs);
        this.logs += 1;
        return;
      case 'run.status':
        this.finalStatus = event.to;
        this.spanEvent(event, 'run.status', { 'studio.run.status.from': event.from, 'studio.run.status': event.to });
        return;
      case 'step.status': {
        const span = this.spanFor(event.stepKey, event.atMs);
        this.tree.addEvent(span, { atMs: event.atMs, name: 'step.status', attributes: { 'studio.step.status': event.status } });
        if (span !== this.root) {
          span.attributes['studio.step.status'] = event.status;
          span.status = stepStatusCode(event.status);
        }
        return;
      }
      case 'step.recovery':
        this.recoveries += 1;
        this.spanEvent(event, 'step.recovery', { 'studio.recovery.action': event.actionKind, 'studio.outcome': recoveryOutcome(event) });
        return;
      case 'check.result':
        this.checks += 1;
        this.spanEvent(event, 'check.result', { 'studio.check.id': event.checkId, 'studio.check.outcome': event.outcome });
        return;
      case 'session.started':
        this.sessionSpan(event);
        return;
      case 'session.ended': {
        const session = this.sessionSpan(event);
        Object.assign(session.attributes, { 'studio.outcome': event.outcome, 'studio.cost.usd': event.costUsd });
        session.status = event.outcome === 'failed' ? otlpStatusCode.error : otlpStatusCode.ok;
        return;
      }
      case 'review.verdict':
        this.spanEvent(event, 'review.verdict', {
          'studio.review.subject': event.subject,
          'studio.review.overall': event.overall,
          'studio.review.score_count': event.scores.length,
          'studio.outcome': event.retryRecommended ? 'retry-recommended' : 'no-retry',
        });
        return;
      case 'gate.waiting':
        this.spanEvent(event, 'gate.waiting', { 'studio.gate.name': gateName(event.gate) });
        return;
      case 'gate.answered':
        this.spanEvent(event, 'gate.answered', { 'studio.gate.name': gateName(event.gate), 'studio.outcome': event.outcome });
        return;
      case 'control.request':
        this.spanEvent(event, 'control.request', { 'studio.control.request': event.request });
        return;
    }
  }

  /**
   * Session end lines add the prompt and skill versions. Returns the session id, or null for a line
   * that is not an end line of a session the events named (not mapped).
   */
  addSessionEnd(line: unknown): string | null {
    const parsed = SessionLineSchema.safeParse(line);
    if (!parsed.success || parsed.data.type !== 'end') return null;
    const session = this.tree.get(`${SESSION_PREFIX}${parsed.data.sessionId}`);
    if (session === undefined) return null;
    Object.assign(session.attributes, {
      'studio.prompt.refs': parsed.data.promptRefs,
      'studio.skill.refs': parsed.data.skillRefs,
      'studio.outcome': parsed.data.outcome,
    });
    session.status = parsed.data.outcome === 'failed' ? otlpStatusCode.error : otlpStatusCode.ok;
    this.tree.touch(session, parsed.data.atMs);
    return parsed.data.sessionId;
  }

  finish(counts: { mappedLines: number; unmappedLines: number }): void {
    Object.assign(this.root.attributes, {
      'studio.run.id': this.runId,
      'studio.correlation.id': this.correlationId,
      'studio.run.status': this.finalStatus,
      'studio.event.count': counts.mappedLines,
      'studio.log.count': this.logs,
      'studio.check.count': this.checks,
      'studio.recovery.count': this.recoveries,
      'studio.unmapped.count': counts.unmappedLines,
    });
    this.root.status = runStatusCode(this.finalStatus);
  }
}

/**
 * One run as a span tree: run > stage > step > agent session (ADR 0006, RUN-FORMAT section 11).
 * Event text, session error text and every field outside the allowlist are never read into a span.
 */
export function mapRunTrace(source: RunTraceSource): MappedTrace {
  const builder = new RunTraceBuilder(source.runId);
  let mappedLines = 0;
  let unmappedLines = 0;
  for (const line of source.events) {
    const parsed = RunEventSchema.safeParse(line);
    if (!parsed.success || parsed.data.runId !== source.runId) {
      unmappedLines += 1;
      continue;
    }
    builder.add(parsed.data);
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
