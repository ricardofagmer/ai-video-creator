import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { type CheckId, type DeclaredOutput, type StageEstimate } from '@studio/shared/run-format';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { ClaimsArtifactSchema, ResearchArtifactSchema, type ClaimsArtifact } from '../shared/stage-artifacts';
import { readOptionalStageInput, readOwnOutput, stageOutput, type StageOutputSink } from '../shared/stage-io';
import { reportedSuccess, type CheckEvidence, type CheckEvidenceMap } from '../shared/stage-results';
import { readSiteAnalysisInput, siteAnalysisCaveat } from '../shared/site-analysis-input';
import { stageTexts } from '../shared/stage-texts';
import { claimsFromKeyMessages, claimsFromKeyPoints, claimsStatedByOwner } from './claim-evidence';

/** The step result names at most this many dropped key messages. */
const MAX_REPORTED_DROPPED = 10;

/**
 * `verify` (stage): each brief key message becomes a claim with an evidence span in the research
 * text. A key message with no span is dropped from `claims.json` and named in the step result, so
 * the run continues and the script can only cite claims the page supports (owner decision,
 * 2026-11-24: an unbacked key message no longer stops the run). Then each site analysis key point
 * with a span joins as a verified claim; points without one are dropped (site analysis spec,
 * Amendment). Deterministic, no model. `claims-evidence` still fails if an unverified claim ever
 * reaches the artifact. A run with no Source URL has no page: its key messages pass as statements
 * made by the owner.
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
    const pageText = research?.text ?? '';
    // No Source URL: there is no page to check against, so the key messages are the owner's own
    // statements and pass as such. With a source they need a span of the page text, as before.
    const ownerStated = (context.brief.sourceUrl ?? '') === '';
    const messageClaims = ownerStated ? claimsStatedByOwner(context.brief.keyMessages) : claimsFromKeyMessages(context.brief.keyMessages, pageText);
    const keptMessages = messageClaims.filter((claim) => claim.status !== 'unverified');
    const droppedMessages = messageClaims.filter((claim) => claim.status === 'unverified');
    const siteAnalysis = await readSiteAnalysisInput(context);
    const keyPoints = siteAnalysis.status === 'present' ? siteAnalysis.analysis.keyPoints : [];
    // Ids keep the brief's numbering, so a dropped message leaves a gap instead of renaming the rest.
    const pointClaims = claimsFromKeyPoints(keyPoints, pageText, messageClaims.length + 1);
    const claims: ClaimsArtifact = { format: 1, claims: [...keptMessages, ...pointClaims] };
    await outputs.writeJson('claims', ClaimsArtifactSchema, claims);
    if (ownerStated) return reportedSuccess(stageTexts.claimsStatedByOwner(messageClaims.length));
    const pointsNote = keyPoints.length === 0 ? '' : ` ${pointClaims.length} de ${keyPoints.length} ponto(s) da análise do site com evidência.`;
    const droppedNote = droppedMessages.length === 0 ? '' : ` ${stageTexts.keyMessagesDropped(droppedMessages.slice(0, MAX_REPORTED_DROPPED).map((claim) => claim.statement))}`;
    return reportedSuccess(
      `${keptMessages.length} de ${messageClaims.length} mensagem(ns)-chave com evidência na página.${droppedNote}${pointsNote}${siteAnalysisCaveat(siteAnalysis)}`,
    );
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
