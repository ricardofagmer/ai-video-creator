import { toolErrorCodes, type AgentToolName, type ToolErrorCode } from '@studio/shared/agents';

/** C7 `ToolErrorSchema.hint` cap. */
export const TOOL_HINT_MAX_CHARS = 300;

/**
 * A typed failure the model can act on (topology section 3.2 error codes). The wrapper turns it
 * into the error envelope; the message carries the tool and code only, never input or file text.
 */
export class ToolFailure extends Error {
  constructor(
    readonly tool: AgentToolName,
    readonly code: ToolErrorCode,
    readonly hint: string | null,
  ) {
    super(`${tool} returned ${code}`);
    this.name = 'ToolFailure';
  }
}

/** A tool tried to return a code outside its C7 `toolErrorCodes` row: a defect, never shown to the model. */
export class ToolContractDefectError extends Error {
  constructor(
    readonly tool: AgentToolName,
    readonly code: ToolErrorCode,
  ) {
    super(`${tool} may not return ${code}`);
    this.name = 'ToolContractDefectError';
  }
}

/** A success that does not match the tool's shared envelope schema: a defect, never shown to the model. */
export class ToolEnvelopeDefectError extends Error {
  constructor(readonly tool: AgentToolName) {
    super(`${tool} produced an envelope outside its schema`);
    this.name = 'ToolEnvelopeDefectError';
  }
}

/** The only way tools build failures, so a code outside the tool's row can never reach the model. */
export function toolFailure(tool: AgentToolName, code: ToolErrorCode, hint: string | null = null): ToolFailure {
  if (!toolErrorCodes[tool].includes(code)) throw new ToolContractDefectError(tool, code);
  return new ToolFailure(tool, code, hint === null ? null : hint.slice(0, TOOL_HINT_MAX_CHARS));
}
