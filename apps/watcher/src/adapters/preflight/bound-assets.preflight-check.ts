import { type Provider } from '@nestjs/common';
import { type AssetRef } from '@studio/shared/catalog';
import { type RunFile, type Sha256 } from '@studio/shared/run-format';
import { PREFLIGHT_CHECKS } from '../../engine/engine.tokens';
import { type BoundAsset } from '../../engine/postconditions/asset-resolution';
import { type PreflightCheck, type PreflightVerdict } from '../../engine/seams';
import { type StageWorkspace } from '../../engine/stage-workspace';

interface PinnedAsset {
  ref: AssetRef;
  /** The recipe binding's pin; null for run references, which C3 lists by ref only. */
  expectedContentHash: Sha256 | null;
}

/** Owner-facing pt-BR text (D16); each names the asset by `assetId@version`, never by path. */
const texts = {
  postcondition: 'todo ativo vinculado foi resolvido pelo motor com o hash fixado',
  notResolved: 'O motor não conferiu os ativos vinculados antes desta verificação.',
  missing: (ref: AssetRef): string => `O ativo ${ref} não foi resolvido nesta etapa.`,
  pinDiffers: (ref: AssetRef, expected: Sha256, actual: Sha256): string =>
    `O ativo ${ref} foi resolvido com hash ${actual.slice(0, 12)}, mas a receita fixa ${expected.slice(0, 12)}.`,
  passed: (count: number): string => `${count} ativo(s) vinculado(s) presente(s) na resolução do motor.`,
};

function pinnedAssets(run: Readonly<RunFile>): PinnedAsset[] {
  return [
    ...run.recipe.definition.bindings.map((binding): PinnedAsset => ({ ref: binding.ref, expectedContentHash: binding.contentHash })),
    ...run.references.map((ref): PinnedAsset => ({ ref, expectedContentHash: null })),
  ];
}

function pinProblem(pin: PinnedAsset, resolved: readonly BoundAsset[]): string | null {
  const bound = resolved.find((candidate) => candidate.asset.ref === pin.ref);
  if (bound === undefined) return texts.missing(pin.ref);
  if (pin.expectedContentHash !== null && bound.asset.contentHash !== pin.expectedContentHash) {
    return texts.pinDiffers(pin.ref, pin.expectedContentHash, bound.asset.contentHash);
  }
  return null;
}

/**
 * R1-06 `preflight` check (seam `PREFLIGHT_CHECKS`): confirms every asset the run binds (recipe
 * bindings and run references) is present in the engine's own resolution, with the pinned hash.
 * It reads no bytes: the engine's built-in preflight already re-hashed every bound asset through
 * the resolver (criterion 9), and a second pass doubled the disk reads of large referenced assets.
 * A postcondition failure: the step stops with the reason, and no later step of the stage runs.
 */
export class BoundAssetsPreflightCheck implements PreflightCheck {
  readonly name = 'bound-assets-present';

  async check(workspace: StageWorkspace): Promise<PreflightVerdict> {
    const resolved = workspace.cachedBindings();
    if (resolved === null) {
      return { status: 'failed', failure: { origin: 'postcondition', postcondition: texts.postcondition, detail: texts.notResolved } };
    }
    const pins = pinnedAssets(workspace.active.snapshot);
    const problems = pins.map((pin) => pinProblem(pin, resolved)).filter((problem): problem is string => problem !== null);
    if (problems.length === 0) return { status: 'passed', detail: texts.passed(pins.length) };
    return { status: 'failed', failure: { origin: 'postcondition', postcondition: texts.postcondition, detail: problems.join(' ') } };
  }
}

/**
 * Seam binding for `EngineModule.register({ seams })`. It overrides the engine's default (empty)
 * list, so a built-in check the engine adds must live inside the engine, not on this token.
 */
export const boundAssetsPreflightProvider: Provider = {
  provide: PREFLIGHT_CHECKS,
  useValue: [new BoundAssetsPreflightCheck()] satisfies readonly PreflightCheck[],
};
