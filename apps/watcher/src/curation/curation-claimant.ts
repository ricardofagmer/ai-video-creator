import { type CurationFile } from '@studio/shared/curation';
import { isPidAliveSince } from '@studio/shared/run-files';

/**
 * Whether the process that claimed a `collecting` curation still runs (baseline review, single
 * watcher). `claim` records a bare pid and its claim instant, no boot time, so the instant dates
 * the boot: a claim from before this boot is gone, as is one naming `selfPid` (this process has
 * claimed nothing when it sweeps) or a pid with no live process of this user. A curation without a
 * claim has no claimant to wait for.
 */
export function isCurationClaimantAlive(file: Pick<CurationFile, 'claim'>, options: { selfPid: number; bootTimeMs?: number }): boolean {
  if (file.claim === undefined) return false;
  return isPidAliveSince(file.claim.pid, Date.parse(file.claim.claimedAt), options);
}
