import {
  ANALYST_ROLE,
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  PLANNER_ROLE,
  RECOVERY_ROLE,
  WRITER_ROLE,
  type ModelRoleName,
} from './protocol';

/** One row of the topology section 7 per-agent table. */
export interface AgentBounds {
  /** Mastra `maxSteps` on `generate`. */
  readonly maxSteps: number;
  readonly maxToolCalls: number;
  readonly maxTokens: number;
  readonly maxUsd: number;
  /** Wall clock of one agent call; `AbortSignal.timeout` reaches the model call and every tool. */
  readonly timeoutMs: number;
}

/**
 * Topology section 7 per-agent bounds, verbatim (SPEC 0002 "Rules that hold across contracts").
 * The engine copies the matching row into each packet's `budget`.
 */
export const agentBounds: Readonly<Record<ModelRoleName, AgentBounds>> = {
  [PLANNER_ROLE]: { maxSteps: 1, maxToolCalls: 0, maxTokens: 40_000, maxUsd: 0.3, timeoutMs: 120_000 },
  [WRITER_ROLE]: { maxSteps: 1, maxToolCalls: 0, maxTokens: 40_000, maxUsd: 0.15, timeoutMs: 180_000 },
  [DIRECTOR_ROLE]: { maxSteps: 12, maxToolCalls: 12, maxTokens: 120_000, maxUsd: 0.3, timeoutMs: 300_000 },
  [EVALUATOR_ROLE]: { maxSteps: 10, maxToolCalls: 10, maxTokens: 150_000, maxUsd: 0.25, timeoutMs: 300_000 },
  [RECOVERY_ROLE]: { maxSteps: 4, maxToolCalls: 4, maxTokens: 40_000, maxUsd: 0.3, timeoutMs: 120_000 },
  // Site analysis spec: one screenshot read, then the answer; bounded like the planner.
  [ANALYST_ROLE]: { maxSteps: 2, maxToolCalls: 1, maxTokens: 40_000, maxUsd: 0.2, timeoutMs: 120_000 },
};

/** FrameSampleTool widths (topology section 3.2: `width?: 512 | 768`, default 768). */
export const FRAME_WIDTH_SMALL_PX = 512;
export const FRAME_WIDTH_LARGE_PX = 768;

export interface ToolLimits {
  readonly catalogSearch: {
    readonly tagsMax: number;
    readonly textMaxChars: number;
    readonly limitMin: number;
    readonly limitMax: number;
    readonly limitDefault: number;
    readonly summaryMaxChars: number;
    readonly resultMaxChars: number;
  };
  readonly assetDescribe: { readonly previewMaxChars: number };
  readonly runArtifactRead: { readonly resultMaxChars: number; readonly eventsTailCount: number };
  readonly frameSample: {
    readonly timestampsMin: number;
    readonly framesPerCall: number;
    readonly framesPerStep: number;
    readonly ffmpegTimeoutMs: number;
  };
}

/** Input bounds and model-visible preview size caps of topology section 3.2, verbatim. */
export const toolLimits: ToolLimits = {
  catalogSearch: {
    tagsMax: 8,
    textMaxChars: 200,
    limitMin: 1,
    limitMax: 20,
    limitDefault: 8,
    summaryMaxChars: 200,
    resultMaxChars: 4_000,
  },
  assetDescribe: { previewMaxChars: 3_000 },
  runArtifactRead: { resultMaxChars: 6_000, eventsTailCount: 50 },
  frameSample: { timestampsMin: 1, framesPerCall: 8, framesPerStep: 24, ffmpegTimeoutMs: 20_000 },
};

/**
 * Cap of one delimited untrusted text in a packet (prompt, skill, brand voice). The topology
 * requires a cap (section 8) without a number; this value is the SPEC-side choice for R1.
 */
export const untrustedTextMaxChars = 30_000;
