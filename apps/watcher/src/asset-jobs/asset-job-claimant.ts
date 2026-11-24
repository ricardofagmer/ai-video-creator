import { type AssetJobFile } from '@studio/shared/asset-jobs';
import { isPidAliveSince } from '@studio/shared/run-files';

/**
 * True while the process that claimed a `running` job may still be working on it. A job with no
 * claim, a claim by this process's own pid (an earlier life of the pid: the sweep runs before this
 * process claims anything) or a claim under an earlier boot is gone. Throws when the probe itself
 * fails; the caller treats that as alive, because a failed probe is no proof of death.
 */
export function isAssetJobClaimantAlive(file: AssetJobFile, options: { selfPid: number }): boolean {
  if (file.claim === undefined) return false;
  return isPidAliveSince(file.claim.pid, Date.parse(file.claim.claimedAt), options);
}
