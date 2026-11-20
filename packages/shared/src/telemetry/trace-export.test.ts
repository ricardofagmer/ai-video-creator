import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRACE_ATTRIBUTE_ALLOWLIST } from './allowlist';
import { OtlpTraceDocumentSchema, type OtlpAnyValue, type OtlpKeyValue, type OtlpSpan, type OtlpTraceDocument } from './otlp';
import { mapTraceToOtlp, type TraceSourceInput } from './trace-export';

/*
 * SPEC 0006 R3-09, R3-AC-26, ADR 0006: the mapper turns one run's or curation's events.jsonl and
 * session end lines into an OTLP JSON `resourceSpans` document with one trace, and every attribute
 * comes from the allowlist. The fixtures plant forbidden text (brief text, a biometric path, a
 * site address, a prompt, a recipe gate name, a free-text model id) that must never reach the file.
 * Pure functions only: no file, no data home, no network.
 */

const RUN_ID = '01JDA60000000000000000RNN1';
const OTHER_RUN_ID = '01JDA60000000000000000RNN2';
const SESSION_1 = '01JDA60000000000000000SES1';
const SESSION_2 = '01JDA60000000000000000SES2';
const SESSION_3 = '01JDA60000000000000000SES3';
const CURATION_ID = '01JDA70000000000000000CRT1';
const CURATION_SESSION = '01JDA70000000000000000SES1';

const PLANTED_BRIEF = 'ROTEIRO SECRETO: o briefing do cliente';
const PLANTED_PATH = '/Users/owner/ricardo-clone/voice-sample.wav';
const PLANTED_ADDRESS = 'www.example.com/watch?v=planted-video-id';
const PLANTED_PROMPT = 'Você é o roteirista; segue o pacote completo';
const PLANTED_GATE = 'owner-face-check';
const PLANTED_CRITERION = 'hook-strength-owner-notes';
const PLANTED_MODEL = 'Claude at /Users/owner/keys';
const PLANTED = [PLANTED_BRIEF, PLANTED_PATH, PLANTED_ADDRESS, PLANTED_PROMPT, PLANTED_GATE, PLANTED_CRITERION, PLANTED_MODEL];

function event(atMs: number, stepKey: string | null, fields: Record<string, unknown>): Record<string, unknown> {
  return { atMs, runId: RUN_ID, level: 'info', text: PLANTED_BRIEF, stepKey, correlationId: 'req-7f3a', ...fields };
}

const RUN_EVENTS: readonly unknown[] = [
  event(1000, null, { type: 'run.status', from: null, to: 'running' }),
  event(1100, 'script:execute:1', { type: 'step.status', status: 'running' }),
  event(1200, 'script:execute:1', { type: 'session.started', sessionId: SESSION_1, role: 'writer', modelId: 'claude-sonnet-5-5' }),
  event(1300, 'script:execute:1', { type: 'log', text: `abriu ${PLANTED_PATH} e ${PLANTED_ADDRESS}` }),
  event(1500, 'script:execute:1', { type: 'session.ended', sessionId: SESSION_1, role: 'writer', modelId: 'claude-sonnet-5-5', outcome: 'ok', costUsd: 0.12 }),
  event(1550, 'script:execute:1', { type: 'step.status', status: 'ok' }),
  event(1600, 'script:verify:1', { type: 'check.result', checkId: 'output-schema', outcome: 'passed' }),
  event(1650, 'script:verify:1', { type: 'step.recovery', actionKind: 'retry-step', resolved: true, needsPerson: false }),
  event(1700, 'script:verify:1', {
    type: 'review.verdict',
    subject: 'script',
    scores: [{ criterionId: PLANTED_CRITERION, score: 4 }],
    overall: 4,
    retryRecommended: false,
  }),
  event(1750, 'scenes:execute:1', { type: 'session.started', sessionId: SESSION_2, role: 'director', modelId: 'claude-opus-5-5' }),
  event(1800, null, { type: 'gate.waiting', gate: PLANTED_GATE }),
  event(1850, null, { type: 'gate.answered', gate: 'plan', outcome: 'approved' }),
  event(1900, null, { type: 'control.request', request: 'pause' }),
  event(2000, null, { type: 'run.status', from: 'running', to: 'review' }),
  // Not mapped: a field outside the strict schema, and a line of another run.
  event(2100, null, { type: 'run.status', from: 'review', to: 'approved', prompt: PLANTED_PROMPT }),
  { ...event(2200, null, { type: 'log' }), runId: OTHER_RUN_ID },
];

const RUN_SESSION_ENDS: readonly unknown[] = [
  {
    atMs: 1490,
    sessionId: SESSION_1,
    type: 'end',
    outcome: 'ok',
    error: `falhou ao ler ${PLANTED_PATH}`,
    promptRefs: ['script-writer@3'],
    skillRefs: ['house-style@2'],
    noteIds: [],
  },
  // Not mapped: an end line of a session the events never named.
  { atMs: 1495, sessionId: SESSION_3, type: 'end', outcome: 'failed', error: PLANTED_PROMPT, promptRefs: [], skillRefs: [] },
];

const RUN_INPUT: TraceSourceInput = { kind: 'run', runId: RUN_ID, events: RUN_EVENTS, sessionEnds: RUN_SESSION_ENDS };

const TOKENS = { inputTokens: 5200, outputTokens: 900, cacheReadTokens: 4000, cacheWriteTokens: 0 };

const CURATION_INPUT: TraceSourceInput = {
  kind: 'curation',
  curationId: CURATION_ID,
  events: [
    { type: 'curation.claimed', at: '2026-11-19T12:00:00.000Z', curationId: CURATION_ID, pid: 4242 },
    { type: 'curation.collected', at: '2026-11-19T12:00:01.000Z', curationId: CURATION_ID, counts: { runs: 3, notes: 2, evidence: 1, declined: 0 } },
    {
      type: 'curation.call.started',
      at: '2026-11-19T12:00:02.000Z',
      curationId: CURATION_ID,
      sessionId: CURATION_SESSION,
      attempt: 1,
      role: 'curator',
      modelId: PLANTED_MODEL,
      instructionVersion: 'curator@1',
    },
    {
      type: 'curation.call.ended',
      at: '2026-11-19T12:00:05.000Z',
      curationId: CURATION_ID,
      sessionId: CURATION_SESSION,
      attempt: 1,
      outcome: 'ok',
      tokens: TOKENS,
      usd: 0.05,
      durationMs: 3000,
    },
    { type: 'curation.check', at: '2026-11-19T12:00:06.000Z', curationId: CURATION_ID, attempt: 1, passed: ['evidence-in-packet', 'body-changed'], failed: [] },
    { type: 'curation.ended', at: '2026-11-19T12:00:06.500Z', curationId: CURATION_ID, status: 'proposed', reasonId: null, spentUsd: 0.05, durationMs: 6500 },
  ],
  sessionEnds: [
    { type: 'end', sessionId: CURATION_SESSION, outcome: 'ok', instructionVersion: 'curator@1', usage: TOKENS, at: '2026-11-19T12:00:05.000Z' },
    // Not mapped: a prompt line is never an end line.
    { type: 'prompt', sessionId: CURATION_SESSION, text: PLANTED_PROMPT, at: '2026-11-19T12:00:02.000Z' },
  ],
};

function spansOf(document: OtlpTraceDocument): OtlpSpan[] {
  return document.resourceSpans.flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans));
}

function valueOf(attributes: readonly OtlpKeyValue[], key: string): OtlpAnyValue | undefined {
  return attributes.find((candidate) => candidate.key === key)?.value;
}

function attribute(span: OtlpSpan | undefined, key: string): OtlpAnyValue | undefined {
  return span === undefined ? undefined : valueOf(span.attributes, key);
}

function spanWith(document: OtlpTraceDocument, key: string, value: string): OtlpSpan | undefined {
  return spansOf(document).find((span) => {
    const found = attribute(span, key);
    return found !== undefined && 'stringValue' in found && found.stringValue === value;
  });
}

function assertOneTrace(document: OtlpTraceDocument, traceId: string): void {
  const parsed = OtlpTraceDocumentSchema.safeParse(JSON.parse(JSON.stringify(document)));
  assert.ok(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3)));
  assert.equal(document.resourceSpans.length, 1);
  assert.equal(document.resourceSpans[0]?.scopeSpans.length, 1);
  const spans = spansOf(document);
  assert.ok(spans.length > 0);
  assert.ok(spans.every((span) => span.traceId === traceId));
  const roots = spans.filter((span) => span.parentSpanId === undefined);
  assert.equal(roots.length, 1);
  const spanIds = new Set(spans.map((span) => span.spanId));
  assert.equal(spanIds.size, spans.length);
  for (const span of spans) {
    if (span.parentSpanId !== undefined) assert.ok(spanIds.has(span.parentSpanId));
    assert.ok(BigInt(span.startTimeUnixNano) <= BigInt(span.endTimeUnixNano));
  }
}

describe('telemetry mapper: attribute allowlist (R3-AC-26)', () => {
  for (const input of [RUN_INPUT, CURATION_INPUT]) {
    it(`emits only allowlisted attributes for a ${input.kind}`, () => {
      const { document } = mapTraceToOtlp(input);
      for (const resource of document.resourceSpans) {
        for (const { key } of resource.resource.attributes) assert.equal(TRACE_ATTRIBUTE_ALLOWLIST.get(key)?.scope, 'resource', key);
      }
      for (const span of spansOf(document)) {
        const keys = [...span.attributes, ...span.events.flatMap((spanEvent) => spanEvent.attributes)].map(({ key }) => key);
        for (const key of keys) assert.equal(TRACE_ATTRIBUTE_ALLOWLIST.get(key)?.scope, 'span', key);
      }
    });

    it(`never exports planted text, paths, addresses or recipe names for a ${input.kind}`, () => {
      const serialized = JSON.stringify(mapTraceToOtlp(input));
      for (const planted of PLANTED) assert.equal(serialized.includes(planted), false, planted);
    });
  }

  it('counts lines it cannot map and attributes it drops', () => {
    const run = mapTraceToOtlp(RUN_INPUT).summary;
    assert.equal(run.unmappedLines, 3);
    assert.equal(run.mappedLines, 15);
    assert.equal(run.sessionsWithoutEnd, 1);
    const curation = mapTraceToOtlp(CURATION_INPUT).summary;
    assert.equal(curation.unmappedLines, 1);
    assert.equal(curation.mappedLines, 7);
    // The free-text model id is refused by the vocabulary rule.
    assert.equal(curation.droppedAttributes, 1);
  });
});

describe('telemetry mapper: OTLP JSON shape (R3-AC-26)', () => {
  it('maps a run to one trace: run > stage > step > session', () => {
    const { document, summary } = mapTraceToOtlp(RUN_INPUT);
    assert.equal(summary.kind, 'run');
    assert.equal(summary.targetId, RUN_ID);
    assertOneTrace(document, summary.traceId);
    assert.deepEqual(document.resourceSpans[0]?.resource.attributes, [{ key: 'service.name', value: { stringValue: 'video-studio-watcher' } }]);

    const spans = spansOf(document);
    const root = spans.find((span) => span.parentSpanId === undefined);
    assert.equal(root?.name, 'run');
    assert.deepEqual(attribute(root, 'studio.run.id'), { stringValue: RUN_ID });
    assert.deepEqual(attribute(root, 'studio.run.status'), { stringValue: 'review' });
    assert.deepEqual(attribute(root, 'studio.correlation.id'), { stringValue: 'req-7f3a' });
    assert.equal(root?.status.code, 1);
    assert.equal(root?.startTimeUnixNano, '1000000000');
    assert.equal(root?.endTimeUnixNano, '2000000000');

    const session = spanWith(document, 'studio.session.id', SESSION_1);
    const step = spanWith(document, 'studio.step.key', 'script:execute:1');
    const stage = spans.find((span) => span.name === 'stage script');
    assert.equal(session?.parentSpanId, step?.spanId);
    assert.equal(step?.parentSpanId, stage?.spanId);
    assert.equal(stage?.parentSpanId, root?.spanId);
    assert.equal(step?.status.code, 1);
    assert.deepEqual(attribute(session, 'studio.prompt.refs'), { arrayValue: { values: [{ stringValue: 'script-writer@3' }] } });
    assert.deepEqual(attribute(session, 'studio.cost.usd'), { doubleValue: 0.12 });

    const gateEvents = spans.flatMap((span) => span.events).filter((spanEvent) => spanEvent.name.startsWith('gate.'));
    assert.deepEqual(
      gateEvents.map((spanEvent) => valueOf(spanEvent.attributes, 'studio.gate.name')),
      [{ stringValue: 'recipe-gate' }, { stringValue: 'plan' }],
    );
  });

  it('maps a curation to one trace: curation > call attempt > Curator session', () => {
    const { document, summary } = mapTraceToOtlp(CURATION_INPUT);
    assert.equal(summary.kind, 'curation');
    assertOneTrace(document, summary.traceId);
    const spans = spansOf(document);
    const root = spans.find((span) => span.parentSpanId === undefined);
    assert.equal(root?.name, 'curation');
    assert.deepEqual(attribute(root, 'studio.curation.status'), { stringValue: 'proposed' });
    const call = spans.find((span) => span.name === 'curation.call');
    const session = spanWith(document, 'studio.session.id', CURATION_SESSION);
    assert.equal(call?.parentSpanId, root?.spanId);
    assert.equal(session?.parentSpanId, call?.spanId);
    assert.deepEqual(attribute(session, 'studio.tokens.input'), { intValue: '5200' });
    assert.deepEqual(attribute(session, 'studio.instruction.version'), { stringValue: 'curator@1' });
    assert.equal(attribute(session, 'studio.model.id'), undefined);
    // call.ended at 12:00:05 after 3000 ms: the session starts at 12:00:02.
    assert.equal(session?.startTimeUnixNano, `${Date.parse('2026-11-19T12:00:02.000Z')}000000`);
  });

  it('is deterministic and gives each run or curation its own trace id', () => {
    assert.equal(JSON.stringify(mapTraceToOtlp(RUN_INPUT)), JSON.stringify(mapTraceToOtlp(RUN_INPUT)));
    assert.notEqual(mapTraceToOtlp(RUN_INPUT).summary.traceId, mapTraceToOtlp(CURATION_INPUT).summary.traceId);
    const otherRun = mapTraceToOtlp({ kind: 'run', runId: OTHER_RUN_ID, events: [], sessionEnds: [] });
    assert.notEqual(otherRun.summary.traceId, mapTraceToOtlp(RUN_INPUT).summary.traceId);
  });
});
