import { type BadgeTone } from '@studio/ui';
import { type Platform } from '@studio/shared/metrics';
import { type CapabilityStatus, type PlatformCapability } from '@studio/shared/platforms';
import { platformLabels } from '@/features/metrics/metric-labels';
import { type WebMessages } from '@/messages';

/*
 * Helpers of `/contas` and of the platform badges (SPEC 0007 sections 5.3, 5.8 and 5.9); the texts
 * live in `t.platforms`. The account label is always rendered as a text node and never logged.
 */

type PlatformTexts = WebMessages['platforms'];

const statusTones: Readonly<Record<CapabilityStatus, BadgeTone>> = {
  unsupported: 'neutral',
  'awaiting-review': 'warning',
  'not-configured': 'warning',
  disconnected: 'neutral',
  'needs-reconnect': 'danger',
  connected: 'success',
};

/** The badge of one capability status: the text carries the meaning, the tone only repeats it. */
export function capabilityStatusBadge(status: CapabilityStatus, t: PlatformTexts): { label: string; tone: BadgeTone } {
  return { label: t.capabilityStatus[status], tone: statusTones[status] };
}

/**
 * Section 5.3: the confirmation of a gate opening names its consequence. The publish text is the
 * spec's; the metrics one follows it for the other capability.
 */
export function gateOpeningConsequence(platform: Platform, capability: PlatformCapability, t: PlatformTexts): string {
  const name = platformLabels[platform];
  return capability === 'publish' ? t.gate.publishConsequence(name) : t.gate.metricsConsequence(name);
}
