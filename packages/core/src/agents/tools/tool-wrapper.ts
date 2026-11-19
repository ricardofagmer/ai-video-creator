import { Logger } from '@nestjs/common';
import { type z } from 'zod';
import {
  ENVELOPE_DSL_KEY,
  ENVELOPE_HANDOFF_RESULT_KEY,
  ENVELOPE_PAGINATION_KEY,
  ENVELOPE_RESULT_KEY,
  ToolErrorEnvelopeSchema,
  agentToolAllowlists,
  type AgentToolName,
  type ToolErrorEnvelope,
} from '@studio/shared/agents';
import { JsonValueSchema, type JsonValue } from '@studio/shared/run-format';
import { AgentRunError } from '../agents.errors';
import { type AgentToolScope } from '../tooling/agent-tool-set';
import { ToolContractDefectError, ToolEnvelopeDefectError, ToolFailure } from './tool-errors';
import { type StepToolState } from './tool-state';

const DSL_MAX_CHARS = 2000;

/** What a tool returns on success, before the wrapper builds and checks the shared envelope. */
export interface ToolSuccess<Result, Handoff> {
  /** What the tool executed, for tracing only (`_dsl`). */
  readonly dsl: string;
  readonly result: Result;
  /** Full payload, server-side only (`_handoff_result`); never returned to Mastra. */
  readonly handoff: Handoff;
  readonly pagination: string | null;
  /** Trace preview of the result; never image bytes. */
  readonly preview: string;
}

/** Per-call facts every tool receives; all of them come from the engine, none from the model. */
export interface ToolCall {
  readonly scope: AgentToolScope;
  readonly state: StepToolState;
  readonly callIndex: number;
}

/** One read-only tool behind the wrapper (topology 3.2), independent of Mastra. */
export interface GuardedTool<Input, Result, Handoff> {
  readonly name: AgentToolName;
  readonly description: string;
  /** The C7 input schema, unchanged. */
  readonly inputSchema: z.ZodType<Input, unknown>;
  /** The tool's shared envelope (`toolEnvelopeSchema`), checked before anything leaves the wrapper. */
  readonly envelopeSchema: z.ZodType<unknown, unknown>;
  /** Maps schema issues to a code of the tool's own `toolErrorCodes` row. */
  invalidInput(issues: readonly z.ZodIssue[]): ToolFailure;
  run(input: Input, call: ToolCall): Promise<ToolSuccess<Result, Handoff>>;
}

/** The only part of an envelope Mastra receives: `_dsl` and `_handoff_result` stay server-side. */
export interface ModelVisibleOutput {
  readonly [ENVELOPE_RESULT_KEY]: JsonValue;
  readonly [ENVELOPE_PAGINATION_KEY]?: string;
}

/** Topology 3.2 "model-supplied ids overridden": the run is bound at construction, so a sent `runId` is dropped. */
const MODEL_SUPPLIED_RUN_ID_KEY = 'runId';

/** Removes a model-supplied `runId` before validation; every other key reaches the strict C7 schema. */
export function withoutModelRunId(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return Object.fromEntries(Object.entries(raw).filter(([key]) => key !== MODEL_SUPPLIED_RUN_ID_KEY));
}

const logger = new Logger('AgentToolWrapper');

function traceInput(input: unknown): JsonValue {
  const parsed = JsonValueSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Topology section 8 "role check in the tool wrapper": the role row and the bound allowlist must both name the tool. */
function assertCallerMayUse(scope: AgentToolScope, tool: AgentToolName): void {
  if (!agentToolAllowlists[scope.role].includes(tool) || !scope.allowlist.includes(tool)) {
    throw new AgentRunError(scope.role, { kind: 'configuration', reason: 'tools-unavailable' });
  }
}

function errorEnvelope(failure: ToolFailure, dsl: string): ToolErrorEnvelope {
  return ToolErrorEnvelopeSchema.parse({
    [ENVELOPE_DSL_KEY]: dsl.slice(0, DSL_MAX_CHARS),
    [ENVELOPE_RESULT_KEY]: { code: failure.code, hint: failure.hint },
    [ENVELOPE_HANDOFF_RESULT_KEY]: null,
  });
}

/** Converts anything a tool threw into a typed result or a typed call failure; never raw text. */
function settleFailure(scope: AgentToolScope, tool: AgentToolName, error: unknown): ToolFailure {
  if (error instanceof ToolFailure) return error;
  if (error instanceof AgentRunError) throw error;
  if (scope.signal.aborted) throw new AgentRunError(scope.role, { kind: 'cancelled' });
  const reason = error instanceof ToolContractDefectError || error instanceof ToolEnvelopeDefectError ? 'contract-defect' : 'unexpected';
  // The error name only: a message could quote file text or a path.
  logger.error({ event: 'agents.tool-failed', tool, role: scope.role, reason, errorName: error instanceof Error ? error.name : 'unknown' });
  throw new AgentRunError(scope.role, { kind: 'internal' });
}

/**
 * The one wrapper every tool call goes through (topology sections 3.2, 7, 8 and 10): role check,
 * tool-call counter (`ToolCallGate.reserveToolCall`, which stops the agent past `maxToolCalls`),
 * `runId` override, strict C7 input validation, typed `ERROR_*` results, shared envelope check,
 * and the `tool-call` / `tool-result` trace lines. Only `_result` and `_pagination` are returned.
 */
export async function invokeGuardedTool<Input, Result, Handoff>(
  tool: GuardedTool<Input, Result, Handoff>,
  binding: { readonly scope: AgentToolScope; readonly state: StepToolState },
  raw: unknown,
): Promise<ModelVisibleOutput> {
  const { scope } = binding;
  assertCallerMayUse(scope, tool.name);
  if (scope.signal.aborted) throw new AgentRunError(scope.role, { kind: 'cancelled' });
  const callIndex = scope.gate.reserveToolCall();
  const input = withoutModelRunId(raw);
  const tracedInput = traceInput(input);
  await scope.trace.toolCall(tool.name, callIndex, tracedInput);

  // Replaced by the tool's own `_dsl` once it runs; a refused call is traced with its raw input.
  let dsl = `${tool.name} ${JSON.stringify(tracedInput)}`;
  try {
    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) throw tool.invalidInput(parsed.error.issues);
    const success = await tool.run(parsed.data, { scope, state: binding.state, callIndex });
    dsl = success.dsl;
    const envelope = {
      [ENVELOPE_DSL_KEY]: success.dsl.slice(0, DSL_MAX_CHARS),
      [ENVELOPE_RESULT_KEY]: success.result,
      [ENVELOPE_HANDOFF_RESULT_KEY]: success.handoff,
      ...(success.pagination === null ? {} : { [ENVELOPE_PAGINATION_KEY]: success.pagination }),
    };
    if (!tool.envelopeSchema.safeParse(envelope).success) throw new ToolEnvelopeDefectError(tool.name);
    const visible = JsonValueSchema.parse(success.result);
    await scope.trace.toolResult({ tool: tool.name, callIndex, outcome: 'ok', errorCode: null, preview: `${success.dsl}\n${success.preview}` });
    return success.pagination === null
      ? { [ENVELOPE_RESULT_KEY]: visible }
      : { [ENVELOPE_RESULT_KEY]: visible, [ENVELOPE_PAGINATION_KEY]: success.pagination };
  } catch (error) {
    const failure = settleFailure(scope, tool.name, error);
    const envelope = errorEnvelope(failure, dsl);
    const preview = `${envelope[ENVELOPE_DSL_KEY]}\n${failure.code}${failure.hint === null ? '' : `: ${failure.hint}`}`;
    await scope.trace.toolResult({ tool: tool.name, callIndex, outcome: 'error', errorCode: failure.code, preview });
    return { [ENVELOPE_RESULT_KEY]: { code: failure.code, hint: failure.hint } };
  }
}
