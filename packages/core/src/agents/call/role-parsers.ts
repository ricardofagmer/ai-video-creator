import {
  ANALYST_ROLE,
  AnalystPacketSchema,
  DIRECTOR_ROLE,
  DirectorPacketSchema,
  EVALUATOR_ROLE,
  PLANNER_ROLE,
  PlanOutputSchema,
  PlannerPacketSchema,
  RECOVERY_ROLE,
  RecoveryActionSchema,
  RecoveryPacketSchema,
  ReviewPacketSchema,
  ReviewVerdictSchema,
  ScenesOutputSchema,
  ScriptOutputSchema,
  SiteAnalysisSchema,
  WRITER_ROLE,
  WriterPacketSchema,
  type AgentOutput,
  type AgentPacket,
  type ModelRoleName,
} from '@studio/shared/agents';
import { type z } from 'zod';

type Parsed<T> = z.ZodSafeParseResult<T>;

type PacketParsers = { [Role in ModelRoleName]: (value: unknown) => Parsed<AgentPacket<Role>> };
type OutputParsers = { [Role in ModelRoleName]: (value: unknown) => Parsed<AgentOutput<Role>> };

/**
 * Role-indexed C7 parsers. Written as mapped types so that, for a generic `Role`, the parsed value
 * keeps the role's packet or output type without a cast (the `agentContracts` row is the same
 * schema pair).
 */
export const packetParsers: PacketParsers = {
  [PLANNER_ROLE]: (value) => PlannerPacketSchema.safeParse(value),
  [WRITER_ROLE]: (value) => WriterPacketSchema.safeParse(value),
  [DIRECTOR_ROLE]: (value) => DirectorPacketSchema.safeParse(value),
  [EVALUATOR_ROLE]: (value) => ReviewPacketSchema.safeParse(value),
  [RECOVERY_ROLE]: (value) => RecoveryPacketSchema.safeParse(value),
  [ANALYST_ROLE]: (value) => AnalystPacketSchema.safeParse(value),
};

export const outputParsers: OutputParsers = {
  [PLANNER_ROLE]: (value) => PlanOutputSchema.safeParse(value),
  [WRITER_ROLE]: (value) => ScriptOutputSchema.safeParse(value),
  [DIRECTOR_ROLE]: (value) => ScenesOutputSchema.safeParse(value),
  [EVALUATOR_ROLE]: (value) => ReviewVerdictSchema.safeParse(value),
  [RECOVERY_ROLE]: (value) => RecoveryActionSchema.safeParse(value),
  [ANALYST_ROLE]: (value) => SiteAnalysisSchema.safeParse(value),
};

const MAX_FEEDBACK_ISSUES = 10;
const MAX_ISSUE_CHARS = 200;

/** Schema-feedback lines: path and zod message only, bounded (topology section 7). */
export function feedbackIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, MAX_FEEDBACK_ISSUES).map((issue) => {
    const path = issue.path.length === 0 ? '(root)' : issue.path.join('.');
    return `${path}: ${issue.message}`.slice(0, MAX_ISSUE_CHARS);
  });
}
