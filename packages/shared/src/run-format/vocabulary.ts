import { z } from 'zod';
import { KebabIdSchema } from '../common/ids';

/** Version of the on-disk run format (ADR 0003 decision 5). */
export const RUN_FORMAT_VERSION = 1;

/** PRD 7.1 phases. */
export const PhaseIdSchema = z.enum(['pre-production', 'production', 'post', 'delivery']);
export type PhaseId = z.infer<typeof PhaseIdSchema>;

/**
 * R1 stages in canonical order (SPEC 0002 A5). `plan` is the PRD 7.1 "brief" stage, renamed so it
 * never collides with the step `brief`; the stage `verify` and the step `verify` are separate enums.
 * `package` runs before the run enters `review` (K5).
 */
export const StageIdSchema = z.enum([
  'plan',
  'research',
  'verify',
  'script',
  'capture',
  'scenes',
  'narration',
  'composition',
  'captions',
  'fades',
  'music',
  'qa',
  'agent-review',
  'package',
]);
export type StageId = z.infer<typeof StageIdSchema>;
export const stageOrder = StageIdSchema.options;

export const stagePhase: Readonly<Record<StageId, PhaseId>> = {
  plan: 'pre-production',
  research: 'pre-production',
  verify: 'pre-production',
  script: 'pre-production',
  capture: 'production',
  scenes: 'production',
  narration: 'production',
  composition: 'post',
  captions: 'post',
  fades: 'post',
  music: 'post',
  qa: 'delivery',
  'agent-review': 'delivery',
  package: 'delivery',
};

/** Stages a recipe may never switch off: the plan gate and the four outputs at `review` depend on them. */
export const mandatoryStages: readonly StageId[] = ['plan', 'qa', 'package'];

/** PRD 7.2: the seven fixed steps of every stage, in order. */
export const StepNameSchema = z.enum(['brief', 'preflight', 'snapshot', 'execute', 'verify', 'archive', 'record']);
export type StepName = z.infer<typeof StepNameSchema>;
export const stepOrder = StepNameSchema.options;

/** PRD 7.2 step status. `warning` = succeeded after recovery or with a caveat. */
export const StepStatusSchema = z.enum(['pending', 'running', 'ok', 'warning', 'failed', 'skipped']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

/** PRD 7.2 run status. `running` is shown only while the pid in `watcher.pid` is alive. */
export const RunStatusSchema = z.enum([
  'draft',
  'pending',
  'running',
  'waiting',
  'paused',
  'failed',
  'interrupted',
  'review',
  'approved',
  'rejected',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/**
 * `verify`-step checks (PRD 7.3, SPEC 0002 R1-10 and R1-14). Media checks come from the media
 * review command; the rest are engine checks on stage outputs.
 */
export const CheckIdSchema = z.enum([
  'output-schema',
  'refs-resolve',
  'claims-evidence',
  'container',
  'codec',
  'resolution',
  'fps',
  'duration',
  'loudness',
  'true-peak',
  'audio-present',
  'black-frames',
  'caption-timing',
  'reviewer-score',
  'outputs-present',
]);
export type CheckId = z.infer<typeof CheckIdSchema>;

/** `plan` and `final` always exist; a recipe adds others (PRD 7.3, SPEC 0002 A6). */
export const GateIdSchema = KebabIdSchema;
export type GateId = z.infer<typeof GateIdSchema>;
export const reservedGateIds: readonly string[] = ['plan', 'final'];

/** Every external service behind a mock/live switch (SPEC 0002 R1-11). */
export const ProviderNameSchema = z.enum(['claude', 'elevenlabs', 'local-voice', 'capture', 'render']);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

/**
 * Model role of an agent session. The allowed values are the role names of the agent protocol
 * (C7, `packages/shared/src/agents/protocol.ts`); this schema checks only the shape so the run
 * format does not depend on the agents module.
 */
export const ModelRoleSchema = z.string().regex(/^[a-z][a-z-]{1,31}$/, 'expected a model role name');
export type ModelRole = z.infer<typeof ModelRoleSchema>;

/** A provider model id such as `claude-sonnet-5-5`; never a secret. */
export const ModelIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, 'expected a model id');
export type ModelId = z.infer<typeof ModelIdSchema>;

/** Topology section 10 span outcome of an agent session. */
export const SessionOutcomeSchema = z.enum(['ok', 'schema-retry', 'rate-limited', 'failed', 'fallback']);
export type SessionOutcome = z.infer<typeof SessionOutcomeSchema>;

/** What the Reviewer scores (topology section 5, ReviewPacket.subject); names `qa/review-<subject>.json`. */
export const ReviewSubjectSchema = z.enum(['script', 'scenes', 'render']);
export type ReviewSubject = z.infer<typeof ReviewSubjectSchema>;

/** Name of a recorded stage output. Names read by RunArtifactReadTool are the C7 artifact ids. */
export const OutputNameSchema = KebabIdSchema;
