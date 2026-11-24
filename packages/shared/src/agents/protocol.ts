import { z } from 'zod';
import type { StageId } from '../run-format/vocabulary';

/**
 * Agent protocol constants (topology section 4, SPEC 0002 C7). Every string two nodes agree on
 * (engine, packet builders, agents, tools, session writer) lives here and nowhere else; other
 * modules import these values instead of repeating literals. Values that other files reference
 * one by one are declared as single constants so they keep their literal types.
 */

// Model role names (topology section 2), one per agent.
export const PLANNER_ROLE = 'planner';
export const WRITER_ROLE = 'writer';
export const DIRECTOR_ROLE = 'director';
export const EVALUATOR_ROLE = 'evaluator';
export const RECOVERY_ROLE = 'recovery';
/** Reads the run's source page before the script (site analysis spec, 2026-11-23). */
export const ANALYST_ROLE = 'analyst';
export const ModelRoleNameSchema = z.enum([
  PLANNER_ROLE,
  WRITER_ROLE,
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  RECOVERY_ROLE,
  ANALYST_ROLE,
]);
export type ModelRoleName = z.infer<typeof ModelRoleNameSchema>;

// Packet `task` literals (topology section 5).
export const PLAN_RUN_TASK = 'plan-run';
export const WRITE_SCRIPT_TASK = 'write-script';
export const DIRECT_SCENES_TASK = 'direct-scenes';
export const REVIEW_TASK = 'review';
export const RECOVER_STEP_TASK = 'recover-step';
export const ANALYZE_SITE_TASK = 'analyze-site';
export const AgentTaskSchema = z.enum([
  PLAN_RUN_TASK,
  WRITE_SCRIPT_TASK,
  DIRECT_SCENES_TASK,
  REVIEW_TASK,
  RECOVER_STEP_TASK,
  ANALYZE_SITE_TASK,
]);
export type AgentTask = z.infer<typeof AgentTaskSchema>;

/** Packet type names; also the session stream `start.packetType` (RUN-FORMAT section 15). */
export const PacketTypeSchema = z.enum([
  'PlannerPacket',
  'WriterPacket',
  'DirectorPacket',
  'ReviewPacket',
  'RecoveryPacket',
  'AnalystPacket',
]);
export type PacketType = z.infer<typeof PacketTypeSchema>;

/** Packet `outputContract` literals: the output schema the engine parses the answer with. */
export const OutputContractSchema = z.enum([
  'PlanOutput',
  'ScriptOutput',
  'ScenesOutput',
  'ReviewVerdict',
  'RecoveryAction',
  'SiteAnalysis',
]);
export type OutputContract = z.infer<typeof OutputContractSchema>;

// Shared tool envelope keys (topology section 3.1).
export const ENVELOPE_DSL_KEY = '_dsl';
export const ENVELOPE_RESULT_KEY = '_result';
export const ENVELOPE_HANDOFF_RESULT_KEY = '_handoff_result';
export const ENVELOPE_PAGINATION_KEY = '_pagination';
export const ToolEnvelopeKeySchema = z.enum([
  ENVELOPE_DSL_KEY,
  ENVELOPE_RESULT_KEY,
  ENVELOPE_HANDOFF_RESULT_KEY,
  ENVELOPE_PAGINATION_KEY,
]);
export type ToolEnvelopeKey = z.infer<typeof ToolEnvelopeKeySchema>;

/**
 * The read-only agent tools: the four of topology section 3.1, plus SiteScreenshotTool, which
 * hands the analyst the one screenshot the research stage recorded (site analysis spec).
 */
export const AgentToolNameSchema = z.enum([
  'CatalogSearchTool',
  'AssetDescribeTool',
  'RunArtifactReadTool',
  'FrameSampleTool',
  'SiteScreenshotTool',
]);
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;

/** Typed tool error codes (topology section 3.2, one row per tool). */
export const ToolErrorCodeSchema = z.enum([
  'ERROR_INVALID_INPUT',
  'ERROR_NO_MATCH',
  'ERROR_INVALID_REF',
  'ERROR_NOT_FOUND',
  'ERROR_REF_NOT_OFFERED',
  'ERROR_SENSITIVE_ASSET',
  'ERROR_UNKNOWN_ARTIFACT',
  'ERROR_ARTIFACT_NOT_ALLOWED',
  'ERROR_NOT_PRODUCED_YET',
  'ERROR_RESPONSE_TOO_LARGE',
  'ERROR_REDACTION_FAILED',
  'ERROR_SOURCE_NOT_FOUND',
  'ERROR_TIMESTAMP_OUT_OF_RANGE',
  'ERROR_FRAME_BUDGET_EXCEEDED',
  'ERROR_FFMPEG_FAILED',
]);
export type ToolErrorCode = z.infer<typeof ToolErrorCodeSchema>;

/** Which codes each tool may return; a code outside its row is a tool defect. */
export const toolErrorCodes: Readonly<Record<AgentToolName, readonly ToolErrorCode[]>> = {
  CatalogSearchTool: ['ERROR_INVALID_INPUT', 'ERROR_NO_MATCH'],
  AssetDescribeTool: ['ERROR_INVALID_REF', 'ERROR_NOT_FOUND', 'ERROR_REF_NOT_OFFERED', 'ERROR_SENSITIVE_ASSET'],
  RunArtifactReadTool: [
    'ERROR_UNKNOWN_ARTIFACT',
    'ERROR_ARTIFACT_NOT_ALLOWED',
    'ERROR_NOT_PRODUCED_YET',
    'ERROR_RESPONSE_TOO_LARGE',
    'ERROR_REDACTION_FAILED',
  ],
  FrameSampleTool: [
    'ERROR_SOURCE_NOT_FOUND',
    'ERROR_TIMESTAMP_OUT_OF_RANGE',
    'ERROR_FRAME_BUDGET_EXCEEDED',
    'ERROR_FFMPEG_FAILED',
  ],
  SiteScreenshotTool: ['ERROR_NOT_PRODUCED_YET', 'ERROR_SOURCE_NOT_FOUND'],
};

/** Hint texts of topology section 3.2, quoted verbatim; the model reads them to self-correct. */
export const toolErrorHints = {
  noMatch: 'drop tags, widen kinds, shorter text',
  refNotOffered: 'search first or use a packet binding',
  responseTooLarge: 'use offset paging',
  notProducedYet: (stageId: StageId): string => `produced by stage ${stageId}`,
  timestampOutOfRange: (durationMs: number): string => `duration is ${durationMs}`,
  frameBudgetExceeded: (framesPerStep: number): string => `${framesPerStep} frames per step; pick key moments`,
};

/** Tool roster per role (topology section 2); enforced at Agent construction and in the tool wrapper. */
export const agentToolAllowlists: Readonly<Record<ModelRoleName, readonly AgentToolName[]>> = {
  [PLANNER_ROLE]: [],
  [WRITER_ROLE]: [],
  [DIRECTOR_ROLE]: ['CatalogSearchTool', 'AssetDescribeTool', 'RunArtifactReadTool', 'FrameSampleTool'],
  [EVALUATOR_ROLE]: ['AssetDescribeTool', 'RunArtifactReadTool', 'FrameSampleTool'],
  [RECOVERY_ROLE]: ['RunArtifactReadTool'],
  [ANALYST_ROLE]: ['SiteScreenshotTool'],
};

// Run artifact ids readable through RunArtifactReadTool (topology section 3.2).
export const CAPTURES_INDEX_ARTIFACT = 'captures-index';
export const CHECKS_ARTIFACT = 'checks';
export const QA_METRICS_ARTIFACT = 'qa-metrics';
export const RunArtifactIdSchema = z.enum([
  'brief',
  'plan',
  'research',
  'claims',
  'script',
  'scenes',
  CAPTURES_INDEX_ARTIFACT,
  'narration-index',
  QA_METRICS_ARTIFACT,
  CHECKS_ARTIFACT,
  'failed-check',
  'events-tail',
  'now',
]);
export type RunArtifactId = z.infer<typeof RunArtifactIdSchema>;

/** Per-caller artifact allowlists (topology section 3.2); roles with no tool read nothing. */
export const runArtifactAllowlists: Readonly<Record<ModelRoleName, readonly RunArtifactId[]>> = {
  [PLANNER_ROLE]: [],
  [WRITER_ROLE]: [],
  [DIRECTOR_ROLE]: ['brief', 'script', CAPTURES_INDEX_ARTIFACT],
  [EVALUATOR_ROLE]: [
    'brief',
    'script',
    'scenes',
    CAPTURES_INDEX_ARTIFACT,
    'narration-index',
    QA_METRICS_ARTIFACT,
    CHECKS_ARTIFACT,
  ],
  [RECOVERY_ROLE]: ['plan', 'now', 'failed-check', CHECKS_ARTIFACT, 'events-tail'],
  // The analyst holds no RunArtifactReadTool: page text arrives in its packet, the screenshot by its own tool.
  [ANALYST_ROLE]: [],
};

// RecoveryAction kinds: the allowlist of fixes the engine may apply (topology section 5).
export const RETRY_STEP_ACTION = 'retry-step';
export const RETRY_WITH_PARAMS_ACTION = 'retry-with-params';
export const RERUN_PREVIOUS_STAGE_ACTION = 'rerun-previous-stage';
export const NEEDS_PERSON_ACTION = 'needs-person';
export const RecoveryActionKindSchema = z.enum([
  RETRY_STEP_ACTION,
  RETRY_WITH_PARAMS_ACTION,
  RERUN_PREVIOUS_STAGE_ACTION,
  NEEDS_PERSON_ACTION,
]);
export type RecoveryActionKind = z.infer<typeof RecoveryActionKindSchema>;

// ScenesOutput `visual.type` discriminators (topology section 5).
export const CAPTURE_VISUAL = 'capture';
export const ASSET_VISUAL = 'asset';
export const TITLE_CARD_VISUAL = 'title-card';
export const SceneVisualTypeSchema = z.enum([CAPTURE_VISUAL, ASSET_VISUAL, TITLE_CARD_VISUAL]);
export type SceneVisualType = z.infer<typeof SceneVisualTypeSchema>;

// FrameSampleTool sources (topology section 3.2).
export const CAPTURE_FRAME_SOURCE = 'capture';
export const RENDER_FRAME_SOURCE = 'render';
export const FrameSourceSchema = z.enum([CAPTURE_FRAME_SOURCE, RENDER_FRAME_SOURCE]);
export type FrameSource = z.infer<typeof FrameSourceSchema>;

/** Frame image label `t=<ms> source=<capture:id or render>` (topology section 3.2). */
export function frameLabel(timestampMs: number, source: FrameSource, captureId?: string): string {
  const origin = source === CAPTURE_FRAME_SOURCE ? `${CAPTURE_FRAME_SOURCE}:${captureId ?? ''}` : RENDER_FRAME_SOURCE;
  return `t=${timestampMs} source=${origin}`;
}

/** Redaction placeholders written in place of secrets and biometric paths (topology section 3.2). */
export const REDACTED_PLACEHOLDER = '<redacted>';
export const BIOMETRIC_REF_PLACEHOLDER = '<biometric-ref>';

// Delimiter tags around untrusted text (topology sections 3.2, 4 and 8).
export const ASSET_CONTENT_TAG = 'asset-content';
export const RUN_ARTIFACT_TAG = 'run-artifact';
export const UNTRUSTED_TAG = 'untrusted';
export const DelimiterTagSchema = z.enum([ASSET_CONTENT_TAG, RUN_ARTIFACT_TAG, UNTRUSTED_TAG]);
export type DelimiterTag = z.infer<typeof DelimiterTagSchema>;

/** Attribute naming the delimited content: `<asset-content ref="...">`, `<run-artifact id="...">`. */
export const ASSET_CONTENT_REF_ATTRIBUTE = 'ref';
export const RUN_ARTIFACT_ID_ATTRIBUTE = 'id';

const tagAlternation = DelimiterTagSchema.options.join('|');
// Any opening or closing protocol tag inside the content, in any letter case.
const embeddedTagPattern = new RegExp(`<(/?)(${tagAlternation})`, 'gi');
const attributeNamePattern = /^[a-z][a-z-]{0,31}$/;

/**
 * Neutralises every protocol tag inside untrusted text so the content can never close its own
 * delimiter or open a new one; the text stays readable as `&lt;/untrusted`.
 */
export function escapeDelimiterTags(text: string): string {
  return text.replace(embeddedTagPattern, '&lt;$1$2');
}

function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class InvalidDelimiterAttributeError extends Error {
  constructor(readonly attribute: string) {
    super(`Invalid delimiter attribute name "${attribute}"`);
    this.name = 'InvalidDelimiterAttributeError';
  }
}

/** Wraps untrusted text in its delimiter tag, escaping embedded tags and attribute values. */
export function wrapDelimited(tag: DelimiterTag, text: string, attributes: Readonly<Record<string, string>> = {}): string {
  const rendered = Object.entries(attributes).map(([name, value]) => {
    if (!attributeNamePattern.test(name)) throw new InvalidDelimiterAttributeError(name);
    return ` ${name}="${escapeAttributeValue(value)}"`;
  });
  return `<${tag}${rendered.join('')}>${escapeDelimiterTags(text)}</${tag}>`;
}

/** True when `text` is exactly one `tag` block whose body carries no unescaped protocol tag. */
export function isDelimited(tag: DelimiterTag, text: string): boolean {
  const block = new RegExp(`^<${tag}((?: [a-z][a-z-]*="[^"<>]*")*)>([\\s\\S]*)</${tag}>$`);
  const match = block.exec(text);
  if (match === null) return false;
  const body = match[2] ?? '';
  return !new RegExp(`<(/?)(${tagAlternation})`, 'i').test(body);
}
