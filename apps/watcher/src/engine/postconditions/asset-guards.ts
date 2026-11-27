import { type StageId } from '@studio/shared/run-format';
import { type BoundAsset } from './asset-resolution';

/**
 * Stages that read a biometric asset. In R1 only `narration` uses the cloned voice (topology
 * section 2, SPEC 0002 A15); the avatar is R2. A failure in one of them is never retried
 * automatically while a biometric asset is bound (PRD 7.3), and no Recovery rerun may reach them.
 */
export const biometricStages: readonly StageId[] = ['narration'];

export function boundBiometricAsset(assets: readonly BoundAsset[]): BoundAsset | undefined {
  return assets.find((bound) => bound.asset.sensitivity === 'biometric');
}

/**
 * PRD 7.3 "license or rights doubt": a third-party asset without a recorded licence (criterion 7
 * keeps such a version out of `active`, but a recipe may still pin it). Preflight warns and goes on.
 */
export function licenseDoubtAsset(assets: readonly BoundAsset[]): BoundAsset | undefined {
  return assets.find((bound) => bound.asset.sensitivity === 'third-party' && bound.asset.license === null);
}
