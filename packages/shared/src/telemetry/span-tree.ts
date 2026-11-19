import { allowedAttributes, type TraceAttributeInput } from './allowlist';
import { OTLP_SPAN_KIND_INTERNAL, otlpStatusCode, type OtlpSpan, type OtlpSpanEvent, type OtlpStatusCode } from './otlp';
import { spanIdFor } from './trace-ids';

export type AttributeCandidates = Record<string, TraceAttributeInput>;

export interface SpanEventDraft {
  atMs: number;
  name: string;
  attributes: AttributeCandidates;
}

export interface SpanDraft {
  readonly key: string;
  readonly parentKey: string | null;
  readonly name: string;
  startMs: number | null;
  endMs: number | null;
  attributes: AttributeCandidates;
  status: OtlpStatusCode;
  readonly events: SpanEventDraft[];
}

export interface BuiltSpans {
  spans: OtlpSpan[];
  spanEvents: number;
  droppedAttributes: number;
}

/** One run or curation mapped to a span tree, with the line counts the export reports (ADR 0006). */
export interface MappedTrace {
  tree: SpanTree;
  mappedLines: number;
  /** Lines that failed their schema, named another id, or ended an unknown session. */
  unmappedLines: number;
  sessionsWithoutEnd: number;
}

/** Epoch milliseconds as OTLP `fixed64` nanoseconds, a decimal string. */
function unixNano(atMs: number): string {
  return (BigInt(Math.max(0, Math.trunc(atMs))) * 1_000_000n).toString();
}

/**
 * Spans of one trace keyed by a studio key (`run`, `stage:script`, `step:script:execute:2`,
 * `session:<sessionId>`). Parents are created before their children, so insertion order is a
 * valid topological order; it is also the output order, which keeps exports byte-identical.
 */
export class SpanTree {
  private readonly drafts = new Map<string, SpanDraft>();

  constructor(private readonly subject: string) {}

  ensure(key: string, init: { parentKey: string | null; name: string }): SpanDraft {
    const existing = this.drafts.get(key);
    if (existing !== undefined) return existing;
    const draft: SpanDraft = { key, parentKey: init.parentKey, name: init.name, startMs: null, endMs: null, attributes: {}, status: otlpStatusCode.unset, events: [] };
    this.drafts.set(key, draft);
    return draft;
  }

  get(key: string): SpanDraft | undefined {
    return this.drafts.get(key);
  }

  /** The rest of every span key that starts with `prefix`, in insertion order. */
  keysWithPrefix(prefix: string): string[] {
    return [...this.drafts.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  }

  /** Widens the span's time range to include `atMs`. */
  touch(draft: SpanDraft, atMs: number): void {
    draft.startMs = draft.startMs === null ? atMs : Math.min(draft.startMs, atMs);
    draft.endMs = draft.endMs === null ? atMs : Math.max(draft.endMs, atMs);
  }

  addEvent(draft: SpanDraft, event: SpanEventDraft): void {
    draft.events.push(event);
    this.touch(draft, event.atMs);
  }

  /** Children widen their parents, so every parent covers its children; untouched spans take the root's time. */
  private settleTimes(): void {
    const ordered = [...this.drafts.values()];
    for (const draft of ordered.reverse()) {
      if (draft.parentKey === null || draft.startMs === null || draft.endMs === null) continue;
      const parent = this.drafts.get(draft.parentKey);
      if (parent === undefined) continue;
      this.touch(parent, draft.startMs);
      this.touch(parent, draft.endMs);
    }
  }

  build(traceId: string): BuiltSpans {
    this.settleTimes();
    const root = [...this.drafts.values()].find((draft) => draft.parentKey === null);
    const fallbackMs = root?.startMs ?? 0;
    let droppedAttributes = 0;
    let spanEvents = 0;
    const spans: OtlpSpan[] = [];
    for (const draft of this.drafts.values()) {
      const attributes = allowedAttributes(draft.attributes, 'span');
      droppedAttributes += attributes.dropped;
      const events: OtlpSpanEvent[] = draft.events.map((event) => {
        const eventAttributes = allowedAttributes(event.attributes, 'span');
        droppedAttributes += eventAttributes.dropped;
        return { timeUnixNano: unixNano(event.atMs), name: event.name, attributes: eventAttributes.attributes };
      });
      spanEvents += events.length;
      const startMs = draft.startMs ?? fallbackMs;
      spans.push({
        traceId,
        spanId: spanIdFor(this.subject, draft.key),
        ...(draft.parentKey === null ? {} : { parentSpanId: spanIdFor(this.subject, draft.parentKey) }),
        name: draft.name,
        kind: OTLP_SPAN_KIND_INTERNAL,
        startTimeUnixNano: unixNano(startMs),
        endTimeUnixNano: unixNano(draft.endMs ?? startMs),
        attributes: attributes.attributes,
        events,
        status: { code: draft.status },
      });
    }
    return { spans, spanEvents, droppedAttributes };
  }
}
