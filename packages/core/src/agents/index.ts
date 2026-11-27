export { AgentsModule, type AgentsModuleOptions } from './agents.module';
export { AgentsService } from './agents.service';
export {
  MOCK_MODEL_ID,
  OPUS_MODEL_ID,
  SONNET_MODEL_ID,
  agentRoster,
  curatorAgentDefinition,
  type AgentDefinition,
  type CuratorAgentDefinition,
} from './agent-roster';
export * from './curator';
export * from './reference-analyst';
export * from './asset-purpose-writer';
export { LEARNING_NOTES_GUARD_LINE } from './prompts/prompt-common';
export { curatorPrompt } from './prompts/curator.prompt';
export { assetPurposePrompt, renderAssetPurposeMessage, type AssetPurposePrompt } from './prompts/asset-purpose.prompt';
export { referenceAnalystPrompt, renderReferenceAnalystMessage, type ReferenceAnalystMessageFacts, type ReferenceAnalystPrompt } from './prompts/reference-analyst.prompt';
export { OutputScanner, type OutputScanResult } from './safety/output-scanner';
export {
  AgentRunError,
  describeAgentFailure,
  type AgentConfigurationReason,
  type AgentErrorCategory,
  type AgentFailure,
  type BudgetBound,
  type OutputRejectionReason,
  type TraceTarget,
} from './agents.errors';
export {
  AGENT_TOOL_SET_PROVIDER,
  type AgentToolScope,
  type AgentToolSet,
  type AgentToolSetProvider,
  type ToolCallGate,
} from './tooling/agent-tool-set';
export { type ToolCallTrace } from './sessions/session-stream';
export { buildAnalystPacket, type AnalystPacketSource } from './packets/analyst.packet';
export { mockSiteAnalysis } from './adapters/mock-outputs';
export { buildPlannerPacket, type PlannerPacketSource } from './packets/planner.packet';
export {
  buildDirectorPacket,
  buildWriterPacket,
  OWNER_REFERENCES_MAX,
  OWNER_REFERENCE_TEXT_MAX_CHARS,
  type CaptureSummary,
  type DirectorPacketSource,
  type OwnerReferenceNote,
  type Revision,
  type VerifiedClaim,
  type WriterPacketSource,
} from './packets/generator.packets';
export { buildRecoveryPacket, buildReviewPacket, type RecoveryPacketSource, type ReviewPacketSource } from './packets/review-recovery.packets';
export { UntrustedTextTooLongError, type AssetText, type BoundAssetSummary, type PacketCoordinates } from './packets/packet-support';
export {
  RECOVERY_FAILED_WHAT_TO_DO,
  REVIEW_UNAVAILABLE_TEXT,
  agentFailurePolicy,
  plannerFallbackText,
  recoveryFailedText,
  revisionsExhaustedText,
  scenesNotDefinedText,
  scriptNotGeneratedText,
  type AgentFailureResponse,
} from './failure/agent-failure-policy';
export { toAgentStageFailure } from './failure/agent-failure.mapper';
export { MissingStageEstimateError, recipeDefaultPlan } from './failure/recipe-default-plan';
