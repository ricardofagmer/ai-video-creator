import { type Platform } from '@studio/shared/metrics';
import { type PublishFailureReason, type PublishState, type Visibility } from '@studio/shared/platforms';
import { platformLabels } from '@/features/metrics/metric-labels';

/*
 * pt-BR texts of the publish dialog (SPEC 0007 section 5.4). Sentences the spec gives are verbatim;
 * the state and reason labels follow its wording. Titles, captions and tags are the owner's own
 * text and are rendered as text nodes only.
 */

/** OD8: Instagram has no publish tab; the owner posts in the app and pastes the link (R3 form). */
export const INSTAGRAM_PUBLISH_TEXT = 'Publique no Instagram e cole o link';

/** Section 5.4, B8: maps to YouTube `containsSyntheticMedia`. */
export const AI_DISCLOSURE_LABEL = 'Conteúdo alterado ou sintético';

/** Section 5.4, after a terminal `failed`. */
export const NO_RESEND_TEXT = 'Nada será reenviado sem um novo clique.';

/**
 * Section 5.5, a `queued` attempt: the watcher claims publish requests only between runs. No file
 * says whether a run is executing now, so the text states the rule instead of claiming the watcher
 * is busy (owner decision 2026-11-21, finding R6).
 */
export const QUEUED_BETWEEN_RUNS_TEXT = 'Na fila: o watcher envia entre uma execução e outra.';

/** Section 16: a published video is removed only by the owner in the platform. */
export const CANNOT_UNPUBLISH_TEXT = 'O estúdio não consegue desfazer uma publicação: para remover um vídeo publicado, apague-o na plataforma.';

export function publishButtonLabel(platform: Platform): string {
  return `Publicar em ${platformLabels[platform]}`;
}

/** Section 5.4 (OD4), above the biometric assets. */
export function biometricIntroText(platform: Platform): string {
  return `Este vídeo usa os ativos biométricos abaixo. Ao publicar, você confirma o envio deles para ${platformLabels[platform]}.`;
}

/** Section 5.4, an `outcome-unknown` attempt. */
export function outcomeUnknownText(platform: Platform): string {
  const name = platformLabels[platform];
  return `Não foi possível confirmar o envio. Confira em ${name} antes de tentar de novo; se o vídeo estiver lá, cole o link em Publicações.`;
}

export const visibilityLabels: Readonly<Record<Visibility, string>> = {
  public: 'Público',
  unlisted: 'Não listado',
  private: 'Privado',
};

/** The visibility inside a "O que saiu da máquina" line ("..., público; ..."). */
export const visibilityWords: Readonly<Record<Visibility, string>> = {
  public: 'público',
  unlisted: 'não listado',
  private: 'privado',
};

/** Q2, OD6: TikTok receives an inbox draft, so its one visibility needs a word of explanation. */
export function visibilityDescription(platform: Platform, visibility: Visibility): string | undefined {
  if (platform === 'tiktok' && visibility === 'private') return 'Rascunho na caixa de entrada do TikTok; você termina o post no aplicativo.';
  return undefined;
}

export const publishStateLabels: Readonly<Record<PublishState, string>> = {
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

export const publishFailureTexts: Readonly<Record<PublishFailureReason, string>> = {
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
  'request-mismatch': 'O pedido de publicação não confere com o registro do estúdio. Nada foi enviado; clique de novo para publicar.',
  'internal-error': 'Ocorreu um erro interno no estúdio.',
};

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "20/11/2026 10:02" from an ISO instant, in the Mac's local time. */
export function formatInstant(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormatter.format(date).replace(',', '');
}
