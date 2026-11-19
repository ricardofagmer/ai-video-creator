import { z } from 'zod';
import { IsoDateTimeSchema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { StepKeySchema } from './step-key';
import {
  GateIdSchema,
  ModelRoleSchema,
  ProviderNameSchema,
  StageIdSchema,
  type RunStatus,
} from './vocabulary';

/**
 * Why a run waits for a person (PRD 7.3, topology section 9). Every cause except `gate` is a
 * never-retried or after-retries condition; the owner text lives in the `waiting` state.
 */
export const WaitingCauseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gate'), gate: GateIdSchema }).strict(),
  z.object({ kind: z.literal('authentication'), provider: ProviderNameSchema }).strict(),
  z
    .object({
      kind: z.literal('cost-ceiling'),
      ceiling: z.enum(['run', 'month']),
      estimateUsd: z.number().nonnegative(),
      limitUsd: z.number().nonnegative(),
    })
    .strict(),
  z.object({ kind: z.literal('license-doubt'), ref: AssetRefSchema }).strict(),
  z.object({ kind: z.literal('claim-without-evidence'), claimIds: z.array(z.string().max(64)).min(1).max(50) }).strict(),
  z.object({ kind: z.literal('biometric-asset'), ref: AssetRefSchema }).strict(),
  z.object({ kind: z.literal('needs-person'), stepKey: StepKeySchema }).strict(),
  z.object({ kind: z.literal('planner-questions'), questions: z.array(z.string().max(300)).min(1).max(5) }).strict(),
  z
    .object({
      kind: z.literal('revisions-exhausted'),
      stageId: StageIdSchema,
      issues: z.array(z.string().max(300)).max(20),
    })
    .strict(),
  z.object({ kind: z.literal('agent-failed'), role: ModelRoleSchema, stepKey: StepKeySchema }).strict(),
]);
export type WaitingCause = z.infer<typeof WaitingCauseSchema>;

const since = IsoDateTimeSchema;
const ownerText = z.string().min(1).max(2000);
const decidedBy = z.string().min(1).max(100);

/** Run status with the facts each status needs (PRD 7.2), discriminated by `status`. */
export const RunStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('draft'), since }).strict(),
  z.object({ status: z.literal('pending'), since }).strict(),
  z.object({ status: z.literal('running'), since, pid: z.number().int().positive() }).strict(),
  /** `reason` and `whatToDo` are owner-facing pt-BR text (D16). */
  z.object({ status: z.literal('waiting'), since, cause: WaitingCauseSchema, reason: ownerText, whatToDo: ownerText }).strict(),
  z.object({ status: z.literal('paused'), since }).strict(),
  z.object({ status: z.literal('failed'), since, reason: ownerText, stepKey: StepKeySchema.nullable() }).strict(),
  z.object({ status: z.literal('interrupted'), since, reason: ownerText }).strict(),
  z.object({ status: z.literal('review'), since }).strict(),
  z.object({ status: z.literal('approved'), since, decidedBy }).strict(),
  z.object({ status: z.literal('rejected'), since, decidedBy, gate: GateIdSchema }).strict(),
]);
export type RunState = z.infer<typeof RunStateSchema>;

/** Statuses from which `resume` continues at `cursor` (eng-grafo FORMATO "Status do loop"). */
export const resumableStatuses: readonly RunStatus[] = ['waiting', 'paused', 'failed', 'interrupted'];

/**
 * What an interface shows: a recorded `running` with a dead watcher pid reads as `interrupted`,
 * without writing anything (only the watcher writes run.json while it lives).
 */
export function displayedRunStatus(state: RunState, watcherAlive: boolean): RunStatus {
  return state.status === 'running' && !watcherAlive ? 'interrupted' : state.status;
}
