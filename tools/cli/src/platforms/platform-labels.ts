import { apiRev7ErrorTexts, type ApiRev7ErrorReason } from '@studio/shared/api';
import {
  type Platform,
  type PlatformCapability,
  type PlatformMode,
  type PollBackoffReason,
  type PublishFailureReason,
  type PublishState,
  type ReconnectReason,
  type Visibility,
} from '@studio/shared/platforms';

/*
 * pt-BR words of the platform commands (SPEC 0007 sections 5.3, 5.4, 5.8 and 5.9). The status
 * labels themselves are the shared `capabilityStatusLabels`, so the CLI and the web print the same
 * words (AC 44); the sentences the spec gives verbatim come from `apiRev7ErrorTexts`. The other
 * words follow the web's (`apps/web/src/features/platforms`, `publishing`).
 */

export const PLATFORM_LABELS: Readonly<Record<Platform, string>> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export const CAPABILITY_LABELS: Readonly<Record<PlatformCapability, string>> = {
  metrics: 'Métricas',
  publish: 'Publicação',
};

/** The `{modo}` word of `platform-mode-mismatch` and the mode shown beside each platform. */
export const MODE_WORDS: Readonly<Record<PlatformMode, string>> = {
  mock: 'simulado',
  live: 'real',
};

/** Section 5.8: shown whenever the platform runs in mock mode. */
export const MOCK_MODE_TEXT = 'Modo simulado: nada será enviado.';

/** OD2, AC 44: the R3 CSV and form import stay available in every state (`importFallback`). */
export const IMPORT_FALLBACK_TEXT = 'A importação por CSV e o formulário continuam disponíveis.';

export const RECONNECT_REASON_TEXTS: Readonly<Record<ReconnectReason, string>> = {
  'token-revoked': 'A permissão do estúdio foi revogada na plataforma.',
  'refresh-expired': 'A autorização venceu.',
  'scope-missing': 'A plataforma não concedeu todas as permissões pedidas.',
  'account-changed': 'A conta da plataforma mudou desde a conexão.',
  'token-missing': 'A autorização guardada no Keychain não foi encontrada.',
};

export const BACKOFF_REASON_TEXTS: Readonly<Record<PollBackoffReason, string>> = {
  'rate-limited': 'limite de requisições atingido',
  'quota-exhausted': 'cota diária esgotada',
  'platform-unavailable': 'plataforma indisponível',
  network: 'sem conexão com a plataforma',
};

export const VISIBILITY_WORDS: Readonly<Record<Visibility, string>> = {
  public: 'público',
  unlisted: 'não listado',
  private: 'privado',
};

export const PUBLISH_STATE_LABELS: Readonly<Record<PublishState, string>> = {
  queued: 'Na fila',
  uploading: 'Enviando',
  processing: 'Processando na plataforma',
  'sent-to-inbox': 'Enviado para a caixa de entrada',
  published: 'Publicado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  expired: 'Expirou sem ser enviado',
  'outcome-unknown': 'Envio sem confirmação',
  'inbox-unconfirmed': 'Rascunho não confirmado',
};

export const PUBLISH_FAILURE_TEXTS: Readonly<Record<PublishFailureReason, string>> = {
  'run-not-approved': 'A execução não está aprovada.',
  'gate-closed': 'A publicação nesta plataforma foi fechada por você.',
  'mode-mismatch': 'A conta foi conectada em outro modo.',
  'account-not-connected': 'A conta não está conectada.',
  'token-revoked': 'A permissão do estúdio foi revogada na plataforma. Conecte de novo em Contas.',
  'scope-missing': 'A plataforma não concedeu a permissão de envio. Conecte de novo em Contas.',
  'quota-exhausted': 'A cota diária da plataforma acabou.',
  'rate-limited': 'A plataforma pediu para esperar antes de novos envios.',
  'artifact-missing': 'O vídeo final não foi encontrado.',
  'artifact-changed': 'O vídeo final mudou depois da aprovação.',
  'media-rejected': 'A plataforma recusou o vídeo.',
  'metadata-rejected': 'A plataforma recusou o título, a descrição ou as tags.',
  'policy-rejected': 'A plataforma recusou o envio pelas regras dela.',
  'account-not-eligible': 'A conta não pode receber envios pela API.',
  network: 'A conexão caiu durante o envio.',
  'platform-unavailable': 'A plataforma estava indisponível.',
  'watcher-interrupted': 'O vigia foi interrompido durante o envio.',
  'internal-error': 'Ocorreu um erro interno no estúdio.',
};

/** Section 5.4, after a terminal `failed`. */
export const NO_RESEND_TEXT = 'Nada será reenviado sem um novo clique.';

/** Section 5.9: connect needs the api listening for the platform's callback, so it lives in the web. */
export function connectIsWebOnlyText(webPort: number): string {
  return (
    `Conectar ou reconectar uma conta é feito só no web, na página Contas (http://127.0.0.1:${webPort}/contas): ` +
    'a api precisa estar rodando para receber o retorno da plataforma ("studio start").'
  );
}

/**
 * The verbatim pt-BR text of a C10 rev 7 reason (section 4.4) with `{plataforma}` and `{modo}`
 * filled. `accountMode` is the mode the account was connected in; null when the caller cannot know
 * it, which reads "diferente".
 */
export function refusalText(reason: ApiRev7ErrorReason, context: { platform: Platform | null; accountMode: PlatformMode | null }): string {
  const platform = context.platform === null ? 'a plataforma' : PLATFORM_LABELS[context.platform];
  const mode = context.accountMode === null ? 'diferente' : MODE_WORDS[context.accountMode];
  return apiRev7ErrorTexts[reason].replaceAll('{plataforma}', platform).replaceAll('{modo}', mode);
}

/** An account is connected in the other mode exactly when `platform-mode-mismatch` applies. */
export function otherMode(mode: PlatformMode): PlatformMode {
  return mode === 'mock' ? 'live' : 'mock';
}
