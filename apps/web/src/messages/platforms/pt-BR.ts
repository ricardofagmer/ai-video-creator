import type { CapabilityStatus, PlatformCapability, PollBackoffReason, ReconnectReason } from '@studio/shared/platforms';

/** `/contas` and the platform badges (SPEC 0007 sections 5.3, 5.8 and 5.9). pt-BR is the source of truth for the group's type. */
export const platformsPtBR = {
  page: {
    title: 'Contas',
    description:
      'As suas contas no YouTube, Instagram e TikTok. Cada plataforma é liberada por você, separadamente, depois que ela aprovar o aplicativo; o estúdio só publica quando você clica em Publicar numa execução aprovada.',
    loadFailed: (detail: string): string => `Não foi possível carregar as contas. ${detail}`,
  },
  /** Section 5.3, verbatim (`capabilityStatusLabels` of `@studio/shared/platforms`). */
  capabilityStatus: {
    unsupported: 'Publique no aplicativo e cole o link',
    'awaiting-review': 'Aguardando revisão da plataforma',
    'not-configured': 'Aplicativo não configurado',
    disconnected: 'Conta não conectada',
    'needs-reconnect': 'Reconecte a conta',
    connected: 'Conectada',
  } satisfies Record<CapabilityStatus, string>,
  capabilities: {
    metrics: 'Métricas',
    publish: 'Publicação',
  } satisfies Record<PlatformCapability, string>,
  /** Section 5.8: the banner of every platform in mock mode. */
  mockMode: 'Modo simulado: nada será enviado.',
  /** The badge of a simulated platform or publication. */
  mockBadge: 'simulado',
  /** OD2, AC 44: the R3 CSV and form import stay available in every state. */
  importFallback: 'A importação por CSV e o formulário continuam disponíveis.',
  importLink: 'Importar métricas de um CSV',
  reconnectReasons: {
    'token-revoked': 'A permissão do estúdio foi revogada na plataforma.',
    'refresh-expired': 'A autorização venceu.',
    'scope-missing': 'A plataforma não concedeu todas as permissões pedidas.',
    'account-changed': 'A conta da plataforma mudou desde a conexão.',
    'token-missing': 'A autorização guardada no Keychain não foi encontrada.',
  } satisfies Record<ReconnectReason, string>,
  backoffReasons: {
    'rate-limited': 'limite de requisições atingido',
    'quota-exhausted': 'cota diária esgotada',
    'platform-unavailable': 'plataforma indisponível',
    network: 'sem conexão com a plataforma',
  } satisfies Record<PollBackoffReason, string>,
  card: {
    account: 'Conta',
    noAccount: 'Nenhuma conta conectada',
    connectedAt: 'Conectada em',
    lastPoll: 'Última coleta',
    backoff: 'Coleta pausada',
    backoffValue: (reason: string, until: string): string => `${reason}; tenta de novo em ${until}`,
    publications: 'Publicações',
    tracked: (count: number): string => (count === 1 ? '1 publicação acompanhada' : `${count} publicações acompanhadas`),
  },
  gate: {
    enable: (capability: string): string => `Liberar ${capability}`,
    enabledByYou: 'Liberado por você.',
    enableAfterReview: (platform: string): string => `Ligue só depois que ${platform} aprovar o aplicativo.`,
    confirmTitle: (capability: string, platform: string): string => `Liberar ${capability} em ${platform}?`,
    publishConsequence: (platform: string): string => `O estúdio poderá enviar vídeos para ${platform} quando você clicar em Publicar.`,
    metricsConsequence: (platform: string): string =>
      `O estúdio passará a coletar sozinho as métricas das suas publicações em ${platform}, dentro da cota gratuita da plataforma.`,
    cancel: 'Cancelar',
    enabling: 'Liberando…',
    confirm: 'Liberar',
  },
  connection: {
    connecting: 'Abrindo a plataforma…',
    connect: 'Conectar',
    reconnect: 'Reconectar',
    disconnect: 'Desconectar',
    disconnectTitle: (platform: string): string => `Desconectar ${platform}?`,
    disconnectDescription: (platform: string, fallback: string): string =>
      `O estúdio apaga o acesso guardado no Keychain e para de coletar métricas e de publicar em ${platform}. ${fallback}`,
    cancel: 'Cancelar',
    disconnecting: 'Desconectando…',
    revoked: (platform: string): string =>
      `O acesso guardado no estúdio foi apagado e a conta de ${platform} confirmou a remoção do acesso do aplicativo.`,
    notRevoked: (platform: string): string =>
      `O acesso guardado no estúdio foi apagado. Para garantir, remova também o acesso do aplicativo nas configurações da sua conta de ${platform}.`,
    connected: 'Conta conectada.',
    connectedTo: (platform: string): string => `Conta de ${platform} conectada.`,
    failed: 'Não foi possível concluir a conexão. Tente de novo.',
  },
} as const;
