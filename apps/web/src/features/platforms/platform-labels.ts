import { type BadgeTone } from '@studio/ui';
import { type Platform } from '@studio/shared/metrics';
import {
  capabilityStatusLabels,
  type CapabilityStatus,
  type PlatformCapability,
  type PollBackoffReason,
  type ReconnectReason,
} from '@studio/shared/platforms';
import { platformLabels } from '@/features/metrics/metric-labels';

/*
 * pt-BR texts of `/contas` and of the platform badges (SPEC 0007 sections 5.3, 5.8 and 5.9). The
 * status labels are the shared `capabilityStatusLabels`, verbatim from section 5.3. The account
 * label is always rendered as a text node and never logged.
 */

/** Section 5.8: the banner of every platform in mock mode. */
export const MOCK_MODE_TEXT = 'Modo simulado: nada será enviado.';

/** The badge of a simulated platform or publication. */
export const MOCK_BADGE_TEXT = 'simulado';

/** OD2, AC 44: the R3 CSV and form import stay available in every state (`importFallback`). */
export const IMPORT_FALLBACK_TEXT = 'A importação por CSV e o formulário continuam disponíveis.';

export const capabilityLabels: Readonly<Record<PlatformCapability, string>> = {
  metrics: 'Métricas',
  publish: 'Publicação',
};

const statusTones: Readonly<Record<CapabilityStatus, BadgeTone>> = {
  unsupported: 'neutral',
  'awaiting-review': 'warning',
  'not-configured': 'warning',
  disconnected: 'neutral',
  'needs-reconnect': 'danger',
  connected: 'success',
};

/** The badge of one capability status: the text carries the meaning, the tone only repeats it. */
export function capabilityStatusBadge(status: CapabilityStatus): { label: string; tone: BadgeTone } {
  return { label: capabilityStatusLabels[status], tone: statusTones[status] };
}

export const reconnectReasonTexts: Readonly<Record<ReconnectReason, string>> = {
  'token-revoked': 'A permissão do estúdio foi revogada na plataforma.',
  'refresh-expired': 'A autorização venceu.',
  'scope-missing': 'A plataforma não concedeu todas as permissões pedidas.',
  'account-changed': 'A conta da plataforma mudou desde a conexão.',
  'token-missing': 'A autorização guardada no Keychain não foi encontrada.',
};

export const backoffReasonTexts: Readonly<Record<PollBackoffReason, string>> = {
  'rate-limited': 'limite de requisições atingido',
  'quota-exhausted': 'cota diária esgotada',
  'platform-unavailable': 'plataforma indisponível',
  network: 'sem conexão com a plataforma',
};

/**
 * Section 5.3: the confirmation of a gate opening names its consequence. The publish text is the
 * spec's; the metrics one follows it for the other capability.
 */
export function gateOpeningConsequence(platform: Platform, capability: PlatformCapability): string {
  const name = platformLabels[platform];
  return capability === 'publish'
    ? `O estúdio poderá enviar vídeos para ${name} quando você clicar em Publicar.`
    : `O estúdio passará a coletar sozinho as métricas das suas publicações em ${name}, dentro da cota gratuita da plataforma.`;
}

/** "1 publicação acompanhada" / "N publicações acompanhadas". */
export function trackedPublicationsText(count: number): string {
  return count === 1 ? '1 publicação acompanhada' : `${count} publicações acompanhadas`;
}
