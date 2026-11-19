import { type AssetRef, type AssetStatus, type AssetVersion } from '@studio/shared/catalog';
import { InvalidStatusTransitionError, LicenseRequiredError } from './catalog.errors';
import { KINDS_REQUIRING_LICENSE } from './catalog.limits';

/**
 * PRD 5.4: a version starts as `draft`; promotion to `active` is an explicit action; deprecation
 * keeps the row. Nothing returns to `draft`. A deprecated version may be promoted again because
 * past manifests still pin it.
 */
const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<AssetStatus, readonly AssetStatus[]>> = {
  draft: ['active', 'deprecated'],
  active: ['deprecated'],
  deprecated: ['active'],
};

export function assertStatusTransition(ref: AssetRef, from: AssetStatus, to: AssetStatus): void {
  if (!ALLOWED_STATUS_TRANSITIONS[from].includes(to)) throw new InvalidStatusTransitionError(ref, from, to);
}

/** Criterion 7, widened to kinds that are third-party by nature (`KINDS_REQUIRING_LICENSE`). */
export function requiresLicenseToActivate(version: AssetVersion): boolean {
  return version.sensitivity === 'third-party' || KINDS_REQUIRING_LICENSE.includes(version.kind);
}

export function assertActivatable(ref: AssetRef, version: AssetVersion): void {
  if (!requiresLicenseToActivate(version)) return;
  const missing: ('license' | 'provenance')[] = [];
  if (version.license === null) missing.push('license');
  if (version.provenance === null) missing.push('provenance');
  if (missing.length > 0) throw new LicenseRequiredError(ref, missing);
}
