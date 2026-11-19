import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { type CheckId, type DeclaredOutput, type StageEstimate } from '@studio/shared/run-format';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { ClaimsArtifactSchema, ResearchArtifactSchema, type ClaimsArtifact } from '../shared/stage-artifacts';
import { readOptionalStageInput, readOwnOutput, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { needsPerson, reportedSuccess, stageFailed, type CheckEvidence, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';
import { claimsFromKeyMessages } from './claim-evidence';

/** C3 `claim-without-evidence.claimIds` holds at most 50 ids. */
const MAX_REPORTED_CLAIM_IDS = 50;

/**
 * `verify` (stage): each brief key message becomes a claim with an evidence span in the research
 * text, or stays unverified. Deterministic, no model. An unverified claim fails `claims-evidence`
 * with the claim ids in the check result (obligation 2), which the engine never retries: the run
 * waits for the owner. When the recipe does not list `claims-evidence` on this stage, the executor
 * stops with a `claim-without-evidence` cause itself, so a claim never passes unchecked.
 */
export class VerifyExecutor extends BaseStageExecutor {
  readonly stageId = 'verify';
  protected readonly faultProvider = 'capture';

  async estimate(): Promise<StageEstimate> {
    return zeroEstimate;
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [stageOutput(context.stage, 'claims', 'claims.json', 'application/json')];
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const research = await readOptionalStageInput(context, 'research', ResearchArtifactSchema);
    const claims: ClaimsArtifact = { format: 1, claims: claimsFromKeyMessages(context.brief.keyMessages, research?.text ?? '') };
    await outputs.writeJson('claims', ClaimsArtifactSchema, claims);
    const unverified = unverifiedIds(claims);
    if (unverified.length > 0 && !context.stageBrief.checks.includes('claims-evidence')) {
      return stageFailed(
        needsPerson(
          { kind: 'claim-without-evidence', claimIds: unverified.slice(0, MAX_REPORTED_CLAIM_IDS) },
          stageTexts.claimsWithoutEvidence(unverified),
          stageTexts.claimsWithoutEvidenceWhatToDo,
        ),
      );
    }
    const verified = claims.claims.length - unverified.length;
    return reportedSuccess(`${verified} de ${claims.claims.length} afirmação(ões) com evidência na página.`);
  }

  protected async checkEvidence(context: StageExecutionContext, checks: readonly CheckId[]): Promise<CheckEvidenceMap> {
    const evidence = new Map<CheckId, CheckEvidence>();
    if (!checks.includes('claims-evidence')) return evidence;
    const claims = await readOwnOutput(context, 'claims', ClaimsArtifactSchema);
    if (claims === null) {
      evidence.set('claims-evidence', { outcome: 'error', expected: 'claims.json', measured: 'ausente', detail: 'A saída claims não foi escrita.' });
      return evidence;
    }
    evidence.set('claims-evidence', claimsEvidence(claims));
    return evidence;
  }
}

function unverifiedIds(claims: ClaimsArtifact): string[] {
  return claims.claims.filter((claim) => claim.status === 'unverified').map((claim) => claim.claimId);
}

function claimsEvidence(claims: ClaimsArtifact): CheckEvidence {
  const unverified = unverifiedIds(claims);
  const total = claims.claims.length;
  return {
    outcome: unverified.length === 0 ? 'passed' : 'failed',
    expected: 'toda afirmação com um trecho de evidência na página capturada',
    measured: `${total - unverified.length} de ${total} com evidência`,
    detail: unverified.length === 0 ? '' : `claimIds sem evidência: ${unverified.join(', ')}`,
  };
}
