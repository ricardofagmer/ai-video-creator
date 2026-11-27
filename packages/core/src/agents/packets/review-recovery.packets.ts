import {
  EVALUATOR_ROLE,
  OutputContractSchema,
  RECOVERY_ROLE,
  RECOVER_STEP_TASK,
  REVIEW_TASK,
  RecoveryPacketSchema,
  ReviewPacketSchema,
  runArtifactAllowlists,
  type RecoveryActionKind,
  type RecoveryPacket,
  type ReviewPacket,
  type RunArtifactId,
  type ScenesOutput,
  type ScriptOutput,
} from '@studio/shared/agents';
import { type Brief, type RubricCriterion } from '@studio/shared/recipes';
import { type QaMetrics, type ReviewSubject, type StageId, type StepName } from '@studio/shared/run-format';
import { runArtifactSources } from '../tools/run-artifact.sources';
import { delimitUntrusted, packetBaseFor, skillTextsField, type AssetText, type PacketCoordinates } from './packet-support';

const BRIEF_SUMMARY_MAX_CHARS = 1000;
const FAILURE_REASON_MAX_CHARS = 2000;

export interface ReviewPacketSource {
  readonly coordinates: PacketCoordinates;
  readonly subject: ReviewSubject;
  /** The pinned recipe's rubric; only criteria for `subject` are copied. */
  readonly rubric: readonly RubricCriterion[];
  readonly brief: Brief;
  readonly artifactIds: readonly RunArtifactId[];
  /** Render reviews only. */
  readonly qaMetrics?: QaMetrics;
  /** Script and scenes reviews: the unrecorded draft the loop is judging. */
  readonly draft?: ScriptOutput | ScenesOutput;
  /** Bound skill texts the work must follow (the evaluator's slot, else every skill of the recipe). */
  readonly skills?: readonly AssetText[];
}

function briefSummary(brief: Brief): string {
  return `${brief.topic}. Mensagens: ${brief.keyMessages.join('; ')}`.slice(0, BRIEF_SUMMARY_MAX_CHARS);
}

/**
 * Reviewer packet (topology section 5). Never sees (section 2): generator reasoning and session
 * streams (only artifact ids, read through its allowlisted tool), past owner verdicts (no source
 * field carries them), credentials. Artifact ids outside the Reviewer's RunArtifactReadTool
 * allowlist are dropped, so the packet never points it at something it may not read.
 */
export function buildReviewPacket(source: ReviewPacketSource): ReviewPacket {
  const readable = runArtifactAllowlists[EVALUATOR_ROLE];
  // The current stage records its outputs only after the review loop, so pointing the Reviewer at
  // one of them would only answer not-produced-yet; the draft under review travels inline instead.
  const producedHere = (artifactId: RunArtifactId): boolean => {
    const artifactSource = runArtifactSources[artifactId];
    return artifactSource.kind === 'stage-output' && artifactSource.producedBy === source.coordinates.stageId;
  };
  return ReviewPacketSchema.parse({
    ...packetBaseFor(EVALUATOR_ROLE, source.coordinates),
    task: REVIEW_TASK,
    inputs: {
      subject: source.subject,
      rubric: source.rubric
        .filter((criterion) => criterion.subjects.includes(source.subject))
        .map((criterion) => ({
          criterionId: criterion.criterionId,
          description: criterion.description,
          weight: criterion.weight,
          threshold: criterion.threshold,
        })),
      briefSummary: briefSummary(source.brief),
      artifactIds: source.artifactIds.filter((artifactId) => readable.includes(artifactId) && !producedHere(artifactId)),
      ...(source.draft === undefined ? {} : { draft: source.draft }),
      ...(source.qaMetrics === undefined ? {} : { qaMetrics: source.qaMetrics }),
      ...skillTextsField(source.skills),
    },
    constraints: { evidenceRequired: true, passDecisionIsEngines: true },
    outputContract: OutputContractSchema.enum.ReviewVerdict,
  });
}

export interface RecoveryPacketSource {
  readonly coordinates: PacketCoordinates;
  readonly failedStep: {
    readonly stageId: StageId;
    readonly step: StepName;
    readonly attempt: number;
    readonly postcondition: string;
    /** Already redacted by the engine (R1-11 redactor); delimited and capped here. */
    readonly redactedFailureReason: string;
  };
  /** The engine's per-step subset of the C7 allowlist (R1-08). */
  readonly allowedActions: readonly RecoveryActionKind[];
}

/**
 * Recovery packet (topology section 5). Never sees (section 2): full session streams (only the
 * failure reason; the redacted events tail is read through its tool), biometric content,
 * credentials. The failure reason can quote tool output or captured text, so it is delimited.
 */
export function buildRecoveryPacket(source: RecoveryPacketSource): RecoveryPacket {
  const { failedStep } = source;
  return RecoveryPacketSchema.parse({
    ...packetBaseFor(RECOVERY_ROLE, source.coordinates),
    task: RECOVER_STEP_TASK,
    inputs: {
      failedStep: {
        stageId: failedStep.stageId,
        step: failedStep.step,
        attempt: failedStep.attempt,
        postcondition: failedStep.postcondition,
        failureReason: delimitUntrusted(failedStep.redactedFailureReason, {
          maxChars: FAILURE_REASON_MAX_CHARS,
          overflow: 'truncate',
        }),
      },
      allowedActions: [...source.allowedActions],
    },
    constraints: { oneFixOnly: true, neverRetryBiometric: true },
    outputContract: OutputContractSchema.enum.RecoveryAction,
  });
}
