import type { ProviderName } from '@studio/shared/run-format';
import type { PublishFailureReason, PublishState, RunPublicationLine, Visibility } from '@studio/shared/platforms';

/** The publish card and dialog (SPEC 0007 section 5.4). pt-BR is the source of truth for the group's type. */
export const publishingPtBR = {
  section: {
    title: 'Publicar',
    description: 'Envie o vídeo aprovado para as suas contas. Nada é enviado sem o seu clique em Publicar.',
    loadFailed: (detail: string): string => `Não foi possível carregar a publicação. ${detail}`,
    open: 'Publicar…',
    unreachable: 'Não foi possível atualizar o envio agora. Tentando de novo…',
  },
  dialog: {
    title: 'Publicar o vídeo aprovado',
    description: (cannotUnpublish: string): string =>
      `O estúdio só envia quando você clica em Publicar. O envio é feito pelo vigia, entre as execuções. ${cannotUnpublish}`,
    close: 'Fechar',
    platforms: 'Plataformas',
  },
  /** OD8: Instagram has no publish tab; the owner posts in the app and pastes the link (R3 form). */
  instagram: 'Publique no Instagram e cole o link',
  /** Section 16: a published video is removed only by the owner in the platform. */
  cannotUnpublish: 'O estúdio não consegue desfazer uma publicação: para remover um vídeo publicado, apague-o na plataforma.',
  tab: {
    account: 'Conta',
    openAccounts: 'Abrir Contas',
    video: 'Vídeo',
    size: 'Tamanho',
    hash: 'Hash',
    connectedAccount: 'Conta conectada',
    sending: 'Enviando o pedido…',
    publishTo: (platform: string): string => `Publicar em ${platform}`,
  },
  fields: {
    title: 'Título',
    description: 'Descrição',
    caption: 'Legenda',
    tiktokCaptionHelp: 'O TikTok recebe só o vídeo, como rascunho. Copie a legenda e cole no aplicativo.',
    copyCaption: 'Copiar legenda',
    copied: 'Legenda copiada.',
    copyFailed: 'Não foi possível copiar; selecione o texto e copie.',
    tags: 'Tags',
    tagsHelp: (max: number): string => `Enter ou vírgula adiciona. Até ${max} tags, só letras, números e _.`,
    visibility: 'Visibilidade',
    /** Section 5.4, B8: maps to YouTube `containsSyntheticMedia`. */
    aiDisclosure: 'Conteúdo alterado ou sintético',
    aiDisclosureHelp: 'Marque quando o vídeo tem voz, rosto ou cena gerados ou alterados por IA.',
    tiktokPrivate: 'Rascunho na caixa de entrada do TikTok; você termina o post no aplicativo.',
  },
  errors: {
    titleRequired: 'Escreva um título.',
    tooLong: (max: number): string => `Use até ${max} caracteres.`,
    captionTooLong: 'Use até 2.200 caracteres.',
    tooManyTags: (max: number): string => `Use até ${max} tags.`,
    tagFormat: 'Cada tag usa só letras, números e _, com até 50 caracteres.',
    visibility: 'Escolha a visibilidade.',
  },
  visibilities: {
    public: 'Público',
    unlisted: 'Não listado',
    private: 'Privado',
  } satisfies Record<Visibility, string>,
  /** The visibility inside a "O que saiu da máquina" line ("..., público; ..."). */
  visibilityWords: {
    public: 'público',
    unlisted: 'não listado',
    private: 'privado',
  } satisfies Record<Visibility, string>,
  biometricIntro: (platform: string): string =>
    `Este vídeo usa os ativos biométricos abaixo. Ao publicar, você confirma o envio deles para ${platform}.`,
  states: {
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
  } satisfies Record<PublishState, string>,
  failures: {
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
  } satisfies Record<PublishFailureReason, string>,
  /** Section 5.4, after a terminal `failed`. */
  noResend: 'Nada será reenviado sem um novo clique.',
  /** Section 5.5, a `queued` attempt: the watcher claims publish requests only between runs. */
  queuedBetweenRuns: 'Na fila: o watcher envia entre uma execução e outra.',
  outcomeUnknown: (platform: string): string =>
    `Não foi possível confirmar o envio. Confira em ${platform} antes de tentar de novo; se o vídeo estiver lá, cole o link em Publicações.`,
  attempts: {
    title: 'Envios',
    requestedAt: (dateTime: string): string => `pedido em ${dateTime}`,
    cancelling: 'Cancelando…',
    cancel: 'Cancelar envio',
    sendingTo: (platform: string): string => `Envio para ${platform}`,
    since: (dateTime: string): string => `desde ${dateTime}`,
    progress: (sent: string, total: string): string => `${sent} de ${total}`,
  },
  leftTheMachine: {
    title: 'O que saiu da máquina',
    description: 'Cada envio para fora do Mac: provedores durante a execução e plataformas depois da aprovação.',
    manifestUnreadable: 'O manifesto (manifest.json) não pôde ser lido, então os envios aos provedores não aparecem aqui.',
    linesUnreadable: 'Não foi possível ler os envios às plataformas.',
    empty: 'Nada saiu da máquina.',
    simulated: (platform: string): string => `${platform} (simulado)`,
    biometricConfirmed: (refs: string): string => `; ativos biométricos confirmados: ${refs}`,
    providers: {
      claude: 'Claude',
      elevenlabs: 'ElevenLabs',
      'local-voice': 'Voz local',
      capture: 'Captura de página',
      render: 'Renderização',
    } satisfies Record<ProviderName, string>,
    events: {
      'upload-started': 'envio do vídeo final iniciado',
      published: 'vídeo final enviado',
      'sent-to-inbox': 'vídeo final enviado para a caixa de entrada',
      failed: 'envio do vídeo final falhou',
      'outcome-unknown': 'vídeo final enviado sem confirmação',
    } satisfies Record<RunPublicationLine['event'], string>,
  },
} as const;
