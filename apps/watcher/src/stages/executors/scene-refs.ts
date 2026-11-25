import { type ScenesOutput } from '@studio/shared/agents';
import type { AssetResolverPort, StageExecutionContext } from '@studio/shared/ports';
import { readRunFile } from '@studio/shared/run-files';
import { type CapturesIndex } from '../shared/stage-artifacts';
import { type CheckEvidence } from '../shared/stage-results';

/**
 * `refs-resolve` for the Scene director's output (SPEC 0002 C7: the engine re-resolves `citedRefs`
 * at `verify`). Every cited or visual asset ref must be a bound asset or a run reference, non-biometric,
 * that still resolves to its pinned hash; every capture visual must name a capture in `captures-index` with
 * in/out points inside its duration.
 */
export async function sceneRefsEvidence(
  context: StageExecutionContext,
  resolver: AssetResolverPort,
  sources: { scenes: ScenesOutput | null; captures: CapturesIndex | null },
): Promise<CheckEvidence> {
  const expected = 'toda referência citada vinculada e resolvida; toda captura citada existe';
  if (sources.scenes === null) return { outcome: 'error', expected, measured: 'scenes.json ausente', detail: '' };
  const problems = [...(await assetProblems(context, resolver, sources.scenes)), ...captureProblems(sources.scenes, sources.captures)];
  const total = countReferences(sources.scenes);
  return {
    outcome: problems.length === 0 ? 'passed' : 'failed',
    expected,
    measured: `${total - Math.min(total, problems.length)} de ${total} referência(s) resolvida(s)`,
    detail: problems.join('; '),
  };
}

function assetRefsOf(scenes: ScenesOutput): string[] {
  const visualRefs = scenes.scenes.flatMap((scene) => (scene.visual.type === 'asset' ? [scene.visual.ref] : []));
  return [...new Set([...scenes.citedRefs, ...visualRefs])];
}

function countReferences(scenes: ScenesOutput): number {
  return assetRefsOf(scenes).length + scenes.scenes.filter((scene) => scene.visual.type === 'capture').length;
}

async function assetProblems(context: StageExecutionContext, resolver: AssetResolverPort, scenes: ScenesOutput): Promise<string[]> {
  const problems: string[] = [];
  const refs = assetRefsOf(scenes);
  if (refs.length === 0) return problems;
  const runReferences = new Set<string>((await readRunFile(context.runDir)).references);
  for (const ref of refs) {
    const binding = context.recipe.bindings.find((candidate) => candidate.ref === ref);
    const offered = context.assets.find((asset) => asset.ref === ref);
    // The recipe pins no run reference, yet the director is offered the owner's pictures and clips
    // (`readReferenceMedia`): such a ref is valid, pinned to the hash `preflight` resolved.
    if (offered === undefined || (binding === undefined && !runReferences.has(ref))) {
      problems.push(`${ref}: não oferecido à etapa`);
      continue;
    }
    if (offered.sensitivity === 'biometric') {
      problems.push(`${ref}: ativo biométrico não pode ser citado`);
      continue;
    }
    const resolution = await resolver.resolve({ ref, expectedContentHash: binding?.contentHash ?? offered.contentHash, signal: context.signal });
    if (resolution.status !== 'resolved') problems.push(`${ref}: ${resolution.status}`);
  }
  return problems;
}

function captureProblems(scenes: ScenesOutput, captures: CapturesIndex | null): string[] {
  const problems: string[] = [];
  for (const scene of scenes.scenes) {
    if (scene.visual.type !== 'capture') continue;
    const { captureId, inMs, outMs } = scene.visual;
    const capture = captures?.captures.find((candidate) => candidate.captureId === captureId);
    if (capture === undefined) problems.push(`${scene.sceneId}: captura ${captureId.slice(0, 64)} inexistente`);
    else if (inMs < 0 || outMs <= inMs || outMs > capture.durationMs) problems.push(`${scene.sceneId}: trecho ${inMs}-${outMs} ms fora da captura`);
  }
  return problems;
}
