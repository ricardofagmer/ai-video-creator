import { PlanOutputSchema, ReviewVerdictSchema, ScriptOutputSchema } from '@studio/shared/agents';
import { reviewVerdictPath } from '@studio/shared/run-format';
import { mockClaims } from '../fixtures/agent-output.fixtures';
import { plannerPacket, reviewPacket, writerPacket } from './agent-packets';
import { MockClaimsSchema, MockResearchSchema, readStageInput } from './mock-artifacts';
import { emitReviewVerdict, recordModelSession } from './mock-sessions';
import { jsonWrite, stageOutput, zeroEstimate, type MockStageBehaviour } from './mock-stage-behaviour';

const JSON_MIME = 'application/json';

export const planBehaviour: MockStageBehaviour = {
  stageId: 'plan',
  provider: 'claude',
  estimate: zeroEstimate,
  outputs: (location) => [stageOutput(location, 'plan', 'plan.json', JSON_MIME)],
  produce: async (context, tools) => {
    const plan = await tools.agents.run('planner', await plannerPacket(context, tools), { signal: context.signal });
    await recordModelSession(context, tools, 'planner');
    return [jsonWrite('plan', PlanOutputSchema, plan)];
  },
  summary: 'Plano simulado: etapas e verificações da receita, custo zero.',
};

export const researchBehaviour: MockStageBehaviour = {
  stageId: 'research',
  provider: 'capture',
  estimate: zeroEstimate,
  outputs: (location) => [stageOutput(location, 'research', 'research.json', JSON_MIME)],
  produce: async (context) => [
    jsonWrite('research', MockResearchSchema, {
      notes: [`Pesquisa simulada sobre: ${context.brief.topic}`],
      candidateClaims: mockClaims,
    }),
  ],
  summary: 'Pesquisa simulada com três afirmações candidatas.',
};

export const verifyBehaviour: MockStageBehaviour = {
  stageId: 'verify',
  provider: 'capture',
  estimate: zeroEstimate,
  outputs: (location) => [stageOutput(location, 'claims', 'claims.json', JSON_MIME)],
  produce: async (context) => {
    const research = await readStageInput(context, 'research', MockResearchSchema);
    return [jsonWrite('claims', MockClaimsSchema, { verified: research.candidateClaims, rejected: [] })];
  },
  summary: 'Afirmações simuladas conferidas contra as capturas.',
  evidence: { 'claims-evidence': '3 de 3 afirmações com evidência' },
};

/** Writer plus its Reviewer verdict; the verdict is evidence for `reviewer-score` (K3 loop is R1-08). */
export const scriptBehaviour: MockStageBehaviour = {
  stageId: 'script',
  provider: 'claude',
  estimate: zeroEstimate,
  outputs: (location) => [
    stageOutput(location, 'script', 'script.json', JSON_MIME),
    { name: 'review-script', path: reviewVerdictPath('script'), mimeType: JSON_MIME },
  ],
  produce: async (context, tools) => {
    const claims = await readStageInput(context, 'claims', MockClaimsSchema);
    const script = await tools.agents.run('writer', writerPacket(context, claims.verified), { signal: context.signal });
    await recordModelSession(context, tools, 'writer');
    const verdict = await tools.agents.run('evaluator', reviewPacket(context, 'script'), { signal: context.signal });
    await recordModelSession(context, tools, 'evaluator');
    await emitReviewVerdict(context, 'script', verdict);
    return [jsonWrite('script', ScriptOutputSchema, script), jsonWrite('review-script', ReviewVerdictSchema, verdict)];
  },
  summary: 'Roteiro simulado com três cenas, cada uma citando uma afirmação.',
  evidence: { 'claims-evidence': '3 de 3 cenas citam afirmações verificadas', 'reviewer-score': 'nota geral 4' },
};
