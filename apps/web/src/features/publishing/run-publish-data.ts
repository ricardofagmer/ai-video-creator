import { type RunPublishView } from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import { type EgressEntry } from '@studio/shared/run-format';

/*
 * What the server reads for an approved run's publish card and "O que saiu da máquina" (SPEC 0007
 * section 5.4). Kept apart from the server loader so client components can name these types.
 */

export type RunPublishRead = { status: 'ready'; view: RunPublishView } | { status: 'failed'; message: string };

/** `manifest.json.egress`, or why it cannot be listed. */
export type ManifestEgressRead = { status: 'ready'; entries: readonly EgressEntry[] } | { status: 'unavailable' };

export interface RunPublishData {
  publish: RunPublishRead;
  /** The connected account's label per platform, shown in its tab as a text node; null when unknown. */
  accountLabels: Readonly<Record<Platform, string | null>>;
  egress: ManifestEgressRead;
}
