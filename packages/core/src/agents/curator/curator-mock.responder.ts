import { DelimiterTagSchema, UNTRUSTED_TAG } from '@studio/shared/agents';
import { type CuratorOutput, type CuratorTaskPacket } from '@studio/shared/curation';
import { z } from 'zod';

/**
 * Mock Curator answer (ADR 0002 "Mock by default"): deterministic, built from the packet only,
 * zero cost. It is parsed with `CuratorOutputSchema` like a live answer and meant to pass the
 * ground check, so a mock curation reaches `proposed` offline:
 * - prompt and skill: the current body plus one fixed line;
 * - recipe: the definition JSON with one fixed line added to its `notes` text, so it stays valid
 *   and binds the same refs;
 * - no evidence run, or a recipe body without a `notes` text: `no-change`.
 */

const MOCK_BODY_LINE = 'Nota do curador simulado: mantenha frases curtas e cite apenas fatos verificados.';
const MOCK_EVIDENCE_RUNS = 1;

const tagAlternation = DelimiterTagSchema.options.join('|');
const escapedTagPattern = new RegExp(`&lt;(/?)(${tagAlternation})`, 'g');
const untrustedBlockPattern = new RegExp(`^<${UNTRUSTED_TAG}(?: [a-z][a-z-]*="[^"<>]*")*>([\\s\\S]*)</${UNTRUSTED_TAG}>$`);

const RecipeNotesSchema = z.object({ notes: z.string() }).passthrough();

/** The subject body without its delimiter block, with escaped protocol tags restored. */
function undelimitedBody(body: string): string {
  const inner = untrustedBlockPattern.exec(body)?.[1] ?? body;
  return inner.replace(escapedTagPattern, '<$1$2');
}

function noChange(reason: string): CuratorOutput {
  return { decision: 'no-change', reason };
}

function proposedRecipeBody(body: string): string | null {
  let definition: unknown;
  try {
    definition = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = RecipeNotesSchema.safeParse(definition);
  if (!parsed.success) return null;
  const notes = parsed.data.notes.length === 0 ? MOCK_BODY_LINE : `${parsed.data.notes}\n${MOCK_BODY_LINE}`;
  return JSON.stringify({ ...parsed.data, notes }, null, 2);
}

export function curatorMockResponse(packet: CuratorTaskPacket): CuratorOutput {
  const evidenceRunIds = packet.inputs.outcomes.runs.slice(0, MOCK_EVIDENCE_RUNS).map((run) => run.runId);
  if (evidenceRunIds.length === 0) return noChange('Modo simulado: não há execuções revisadas que sustentem uma mudança.');

  const { subject } = packet.inputs;
  const body = undelimitedBody(subject.body);
  const newBody = subject.kind === 'recipe' ? proposedRecipeBody(body) : `${body.trimEnd()}\n\n${MOCK_BODY_LINE}`;
  if (newBody === null) return noChange('Modo simulado: a definição da receita não tem um campo de notas para ajustar.');

  return {
    decision: 'propose',
    newBody,
    changeSummary: 'Proposta simulada: acrescenta uma orientação fixa ao texto atual.',
    reason: 'Modo simulado: a proposta é determinística e não usa um modelo.',
    evidenceRunIds,
    expectedEffect: 'Nenhum efeito real; serve para testar o fluxo do curador sem custo.',
    suggestComparison: false,
  };
}
