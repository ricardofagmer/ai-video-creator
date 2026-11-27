import type { ApiGuidedCreationErrorReason, ApiRev5ErrorReason, ApiRev7ErrorReason } from '@studio/shared/api';

/** The numbers of a duration conflict, already written in the reader's language. */
export interface DurationRangeText {
  requestedMin: string;
  requestedMax: string;
  templateMin: string;
  templateMax: string;
}

/**
 * What a rev 7 sentence may name: the platform's display name and the word of the mode the account
 * was connected in. Either is null when the screen does not know it.
 */
interface PlatformSubject {
  platform: string | null;
  mode: string | null;
}

type PlatformSentence = (subject: PlatformSubject) => string;

/*
 * Without a known platform the sentence still reads in Portuguese: the preposition takes its
 * article ("em" becomes "na plataforma") and a leading name becomes "A plataforma".
 */
function inPlatform(platform: string | null): string {
  return platform === null ? 'na plataforma' : `em ${platform}`;
}

function ofPlatform(platform: string | null): string {
  return platform === null ? 'da plataforma' : `de ${platform}`;
}

function withPlatform(platform: string | null): string {
  return platform === null ? 'com a plataforma' : `com ${platform}`;
}

function forPlatform(platform: string | null): string {
  return platform === null ? 'para a plataforma' : `para ${platform}`;
}

const UNREACHABLE = 'Não foi possível falar com o serviço local. Verifique com `studio doctor`.';
const FIELDS_REFUSED = 'Alguns campos não foram aceitos.';
const CONTENT_TOO_LARGE = 'O arquivo passa do limite deste tipo de ativo.';

/** Texts shared across features (api errors). pt-BR is the source of truth for the group's type. */
export const commonPtBR = {
  /** Shared texts of the badge list input (TagInput). */
  tagInput: {
    remove: (tag: string): string => `Remover ${tag}`,
  },
  apiErrors: {
    /** design/telas/01, "Api fora do ar". */
    unreachable: UNREACHABLE,
    requestContract: FIELDS_REFUSED,
    responseContract: 'O serviço local respondeu num formato inesperado. Verifique com `studio doctor`.',
    contentTooLarge: CONTENT_TOO_LARGE,
    status: (status: number, reason: string | null): string => `Erro ${status}${reason === null ? '' : ` (${reason})`}.`,
    unexpected: 'Ocorreu um erro inesperado.',
    /**
     * Rev 5 (SPEC 0006 section 4.4): publications, metrics import and schedules. Nothing is written
     * on any of these. `metrics-required-column-missing` names the platform in the import form; this
     * generic text covers every other screen.
     */
    rev5Reasons: {
      'publication-run-not-approved': 'Só é possível registrar a publicação de uma execução aprovada.',
      'publication-url-not-recognized': 'Link não reconhecido. Use o link completo do vídeo no YouTube, Instagram ou TikTok.',
      'publication-short-link-refused': 'Links curtos não são aceitos. Abra o vídeo e copie o link completo.',
      'publication-already-linked': 'Este vídeo já está ligado a outra execução.',
      'publication-limit-reached': 'Limite de 5 publicações por execução.',
      'publication-has-metrics': 'Esta publicação já tem métricas e não pode ser removida.',
      'publication-not-found': 'Não encontrado.',
      'schedule-not-found': 'Não encontrado.',
      'metrics-as-of-in-future': 'A data das métricas não pode ser no futuro.',
      'metrics-file-too-large': 'Arquivo maior que 2 MB. Exporte um período menor.',
      'metrics-not-csv': 'O arquivo precisa ser um CSV em texto (UTF-8). Planilhas .xlsx e arquivos .zip não são aceitos.',
      'metrics-too-many-rows': 'O arquivo tem mais de 5.000 linhas. Exporte um período menor.',
      'metrics-required-column-missing':
        'Não encontrei as colunas esperadas da exportação desta plataforma. Confira se escolheu a plataforma certa.',
      'metrics-empty-file': 'O arquivo não tem linhas de dados.',
      'schedule-limit-reached': 'Limite de 10 agendamentos.',
      'schedule-recipe-not-runnable': 'O preset escolhido não pode ser executada.',
      'schedule-estimate-changed': 'O custo máximo por execução mudou. Confira o valor e confirme de novo.',
      'schedule-time-invalid': 'Data, hora ou fuso inválido.',
      'schedule-not-editable': 'Este agendamento foi excluído.',
      'invalid-schedule-input': 'Dados do agendamento inválidos. Confira os campos e tente de novo.',
      'schedule-brief-change-refused':
        'Não foi possível mudar a fila de briefs: um brief já usado não pode ser removido, a fila precisa de pelo menos um e cabe no máximo 50.',
      'schedule-file-corrupt': 'Os arquivos deste agendamento estão com problema. Veja `studio doctor`.',
      'invalid-metrics-input': 'Dados das métricas inválidos. Confira os campos e tente de novo.',
      'metrics-snapshot-limit-reached': 'Limite de 400 registros de métricas para esta publicação.',
      'metrics-row-corrupt': 'Um registro de métricas guardado está com problema. Veja `studio doctor`.',
    } satisfies Record<ApiRev5ErrorReason, string>,
    /** Guided creation (docs/specs/2026-11-23-guided-creation-design.md): asset jobs and composition rules. */
    guidedReasons: {
      'composition-conflict': 'Algumas escolhas não combinam num mesmo vídeo. Nada foi salvo nem iniciado; veja a lista e corrija.',
      'asset-job-not-a-voice': 'Esta versão não é uma voz, então não tem amostra.',
      'asset-job-not-a-video-reference': 'Só referências de vídeo podem ser analisadas pela IA.',
      'asset-job-link-only': 'Esta referência é só um link. Anexe o arquivo do vídeo para a IA analisar.',
      'asset-job-biometric-refused': 'A IA não trabalha com material biométrico.',
      'asset-job-queue-full': 'Já há 10 pedidos na fila. Espere um terminar e tente de novo.',
      'asset-job-sample-not-ready': 'A amostra ainda não está pronta.',
    } satisfies Record<ApiGuidedCreationErrorReason, string>,
    /**
     * The C10 error `reason`s the catalog, recipe, run and curation screens can meet. The api's own
     * `message` is English and is never shown; an unknown reason falls back to its status and id.
     */
    reasons: {
      'asset-already-exists': 'Este id já existe no catálogo.',
      'recipe-already-exists': 'Este id de preset já existe.',
      'asset-not-found': 'Ativo não encontrado.',
      'asset-version-not-found': 'Versão do ativo não encontrada.',
      'recipe-not-found': 'Preset não encontrada.',
      'recipe-version-not-found': 'Versão do preset não encontrada.',
      'asset-version-conflict': 'O ativo mudou enquanto você editava. Tente de novo.',
      'recipe-version-conflict': 'O preset mudou enquanto você editava. Tente de novo.',
      'license-required': 'Um ativo de terceiros só pode ficar ativo com licença e procedência preenchidas.',
      'invalid-status-transition': 'Esta versão não pode mudar para esse status.',
      'invalid-recipe-status-transition': 'Esta versão do preset não pode mudar para esse status.',
      'mime-type-not-allowed': 'Tipo de arquivo não aceito para este tipo de ativo.',
      'layout-not-allowed': 'Este tipo de ativo não aceita esse formato (arquivo ou pasta).',
      'biometric-requires-reference': 'Material biométrico só entra no catálogo por referência.',
      'biometric-downgrade': 'Este ativo tem material biométrico; as novas versões continuam biométricas.',
      'content-too-large': CONTENT_TOO_LARGE,
      'body-too-large': CONTENT_TOO_LARGE,
      'upload-rejected': 'O envio foi recusado. Confira o arquivo e tente de novo.',
      'unsafe-path': 'Um nome de arquivo da pasta não é aceito.',
      'unsupported-folder': 'A pasta não pode ser importada.',
      // Rev 4: the by-reference routes give one reason for every refused path, so nothing tells which check failed (A24).
      'reference-path-refused':
        'O caminho não foi aceito. Use um arquivo ou pasta que exista na sua pasta pessoal ou em /Volumes, fora da pasta de dados do estúdio, sem pastas ocultas e sem atalhos (links simbólicos).',
      'source-not-found': 'Nada foi encontrado nesse caminho.',
      'recipe-binding-invalid': 'Um vínculo do preset não corresponde a uma versão do catálogo.',
      'invalid-asset-input': FIELDS_REFUSED,
      'invalid-recipe-input': FIELDS_REFUSED,
      'invalid-request': FIELDS_REFUSED,
      // Rev 3 (SPEC 0003 section 4.3): promotion, learnings, comparisons and search by meaning.
      'promotion-approval-required': 'Uma versão só fica ativa por meio da aprovação de promoção.',
      'promotion-ref-mismatch': 'A versão confirmada não é a versão desta página. Recarregue e confirme de novo.',
      'promotion-secret-scan-unavailable': 'Não foi possível verificar o motivo contra segredos. Nada foi registrado; tente de novo.',
      'invalid-promotion-input': 'O motivo ou a evidência não foram aceitos. Um motivo com aparência de senha ou chave é recusado.',
      'learning-run-not-reviewed': 'Só dá para salvar um aprendizado de uma execução que chegou à revisão.',
      'learning-ref-not-used': 'Esta versão não foi usada nesta execução.',
      'learning-biometric-refused': 'Aprendizados não podem ser salvos em material biométrico.',
      'learning-contains-secret': 'O texto parece conter uma senha ou chave. Nada foi salvo; reescreva sem o segredo.',
      'learning-limit-reached': 'Esta versão já tem 20 aprendizados ativos. Aposente um antes de salvar outro.',
      'learning-secret-scan-unavailable': 'Não foi possível verificar o texto contra segredos. Nada foi salvo; tente de novo.',
      'learning-note-not-found': 'Aprendizado não encontrado.',
      'learning-already-retired': 'Este aprendizado já estava aposentado.',
      'invalid-learning-input': 'O texto do aprendizado não foi aceito. Use de 1 a 500 caracteres.',
      'comparison-subject-invalid': 'A comparação não é válida: escolha outra versão do mesmo ativo ou do mesmo preset.',
      'comparison-biometric-refused': 'Comparações com material biométrico não são permitidas.',
      'comparison-over-month-ceiling': 'As duas execuções passariam do teto de gasto do mês. Nada foi iniciado.',
      'comparison-estimate-changed': 'O custo máximo mudou desde que a página foi aberta. Confira o valor novo antes de iniciar.',
      'comparison-not-startable': 'Esta comparação já foi iniciada ou uma das execuções não está mais em rascunho.',
      'comparison-not-found': 'Comparação não encontrada.',
      'invalid-comparison-input': FIELDS_REFUSED,
      'month-spend-unavailable': 'O gasto do mês não pôde ser lido, então nada foi iniciado. Verifique com `studio doctor`.',
      'embedding-unavailable': 'A busca por significado está indisponível: o modelo local não está pronto. Verifique com `studio doctor`.',
      'invalid-semantic-search': 'A busca não foi aceita. Use de 1 a 500 caracteres.',
      // Rev 4 (SPEC 0005 section 4.4): Curator proposals. Nothing is written or spent on any of these.
      'curation-subject-not-found': 'Versão não encontrada. Recarregue a página.',
      'curation-not-found': 'Proposta do curador não encontrada.',
      'curation-subject-not-curatable': 'O curador só faz propostas para prompts, skills e presets em rascunho ou ativos.',
      'curation-subject-biometric': 'O curador não trabalha com material biométrico.',
      'curation-subject-deprecated': 'Uma versão descontinuada não recebe propostas do curador.',
      'curation-subject-body-too-large': 'O texto desta versão passa de 16.000 caracteres, o limite do curador.',
      'curation-no-reviewed-runs': 'Esta versão ainda não tem uma execução com decisão sua. O curador precisa de pelo menos uma.',
      'curation-over-month-ceiling': 'O pedido passaria do teto de gasto do mês. Nada foi gasto.',
      'curation-queue-full': 'Já há 3 pedidos na fila do curador. Espere um terminar e peça de novo.',
      'curation-already-requested': 'Já há um pedido para esta versão na fila ou em andamento.',
      'curation-estimate-changed': 'O custo máximo mudou. Recarregue a página e confira o valor antes de pedir de novo.',
      'curation-not-decidable': 'Esta curadoria não tem uma proposta para decidir.',
      'curation-already-decided': 'Esta proposta já foi decidida. Recarregue a página.',
      'curation-not-saved': 'Salve a proposta como rascunho antes de comparar. Cada proposta tem no máximo uma comparação.',
      'curation-subject-refused': 'A versão de origem foi descontinuada ou marcada como biométrica, então a proposta não pode mais ser usada.',
      // The api answered: a 500 here is not "service unreachable", so it needs its own text.
      'curation-file-corrupt': 'Os arquivos desta curadoria estão corrompidos. Peça uma proposta nova; verifique com `studio doctor`.',
      'invalid-curation-input': FIELDS_REFUSED,
      'origin-not-allowed': 'A requisição foi recusada por segurança. Recarregue a página.',
      'api-unreachable': UNREACHABLE,
    },
  },
  platformErrors: {
    /** The account's mode in "conectada em modo {modo}". */
    modes: {
      mock: 'simulado',
      live: 'real',
    },
    /**
     * Rev 7 (SPEC 0007 section 4.4): each platform and publish refusal, verbatim from
     * `apiRev7ErrorTexts` with `{plataforma}` and `{modo}` filled by the screen that knows them.
     */
    rev7Reasons: {
      'platform-awaiting-review': () => 'Aguardando revisão da plataforma. Use a importação por CSV ou o formulário enquanto isso.',
      'platform-publish-unsupported': ({ platform }: PlatformSubject) =>
        `O estúdio não publica ${inPlatform(platform)}. Publique no aplicativo e cole o link da publicação.`,
      'platform-not-configured': ({ platform }: PlatformSubject) =>
        `Falta configurar o aplicativo ${ofPlatform(platform)}. Rode \`studio secrets set\` com as credenciais do aplicativo.`,
      'platform-not-connected': ({ platform }: PlatformSubject) => `Conecte a sua conta ${ofPlatform(platform)} primeiro.`,
      'platform-needs-reconnect': ({ platform }: PlatformSubject) =>
        `A conexão ${withPlatform(platform)} expirou ou foi revogada. Conecte de novo.`,
      'platform-mode-mismatch': ({ mode }: PlatformSubject) =>
        mode === null
          ? 'A conta foi conectada e o estúdio está em outro modo.'
          : `A conta foi conectada em modo ${mode} e o estúdio está em outro modo.`,
      'oauth-state-invalid': () => 'Pedido de conexão inválido ou vencido. Comece de novo pela página Contas.',
      'oauth-denied': ({ platform }: PlatformSubject) => `A conexão foi recusada ${inPlatform(platform)}.`,
      'oauth-exchange-failed': ({ platform }: PlatformSubject) =>
        `Não foi possível concluir a conexão ${withPlatform(platform)}. Tente de novo.`,
      'oauth-scope-missing': ({ platform }: PlatformSubject) => `${platform ?? 'A plataforma'} não concedeu as permissões pedidas.`,
      'keychain-unavailable': () => 'Não foi possível gravar no Keychain do macOS.',
      'publish-run-not-approved': () => 'Só é possível publicar uma execução aprovada.',
      'publish-artifact-missing': () => 'O vídeo final não foi encontrado.',
      'publish-artifact-changed': () => 'O vídeo final mudou depois da aprovação. Não foi enviado.',
      'publish-biometric-mismatch': () => 'A lista de ativos biométricos mudou. Confira e confirme de novo.',
      'publish-sensitivity-unknown': () => 'Não foi possível confirmar a sensibilidade de um ativo. Nada foi enviado.',
      'publish-already-in-progress': ({ platform }: PlatformSubject) => `Já existe um envio em andamento ${forPlatform(platform)}.`,
      'publish-already-published': ({ platform }: PlatformSubject) => `Esta execução já foi publicada ${inPlatform(platform)}.`,
      'publish-visibility-not-allowed': ({ platform }: PlatformSubject) => `Essa visibilidade não existe ${inPlatform(platform)}.`,
      'publish-attempt-not-cancellable': () => 'O envio já começou e não pode ser cancelado.',
      'publish-idempotency-key-reused': () =>
        'Este pedido de publicação já foi enviado com outros dados. Abra o diálogo de novo e envie outra vez.',
      'publish-attempt-not-found': () => 'Não encontrado.',
    } satisfies Record<ApiRev7ErrorReason, PlatformSentence>,
  },
  /**
   * Composition rules (guided-creation spec section 3): one sentence per conflict, built from its ids
   * and numbers. Each sentence names what to change.
   */
  compositionConflicts: {
    title: 'Estas escolhas não combinam num mesmo vídeo',
    blockedHint: 'Enquanto a lista tiver um item, o botão fica desligado.',
    duplicateKind: {
      'ai-model': (count: number): string => `Há ${count} vozes no carrinho, mas o preset usa só uma. Deixe uma.`,
      template: (count: number): string => `Há ${count} templates no carrinho. Escolha um.`,
      'brand-kit': (count: number): string => `Há ${count} kits de marca no carrinho. Escolha um.`,
      music: (count: number): string => `Há ${count} músicas no carrinho. Escolha uma.`,
    },
    stageNeedsBinding: {
      script: 'O roteiro está ligado, mas o preset não tem prompt do roteirista.',
      scenes: 'As cenas estão ligadas, mas o preset não tem kit de marca.',
      narration: 'A narração está ligada, mas o preset não tem voz.',
      music: 'A música está ligada, mas o preset não tem trilha.',
      composition: 'A composição está ligada, mas o preset não tem template.',
    },
    musicModeConflict: 'A música está em "A IA decide", mas o preset ainda tem uma trilha escolhida. Escolha a música ou deixe a IA decidir.',
    formatMismatch: {
      aspect: (recipe: string, template: string): string => `O preset é ${recipe} e o template é ${template}.`,
      canvas: (recipe: string, template: string): string => `O preset tem ${recipe} pixels e o template tem ${template}.`,
      fps: (recipe: string, template: string): string => `O preset usa ${recipe} fps e o template usa ${template} fps.`,
    },
    recipeRange: (range: DurationRangeText): string =>
      `O template aceita de ${range.templateMin} a ${range.templateMax} s; o preset pede de ${range.requestedMin} a ${range.requestedMax} s.`,
    runTarget: (range: DurationRangeText): string =>
      `O template aceita de ${range.templateMin} a ${range.templateMax} s; o vídeo pede ${range.requestedMax} s.`,
  },
  /** Loading and error boundaries of each route (`loading.tsx`, `error.tsx`). */
  retry: 'Tentar de novo',
  cancel: 'Cancelar',
  notInformed: 'Não informado',
  boundaries: {
    runs: { loading: 'Carregando as execuções', error: 'Não foi possível carregar as execuções' },
    run: { loading: 'Carregando a execução', error: 'Não foi possível carregar a execução' },
    review: { loading: 'Carregando a revisão', error: 'Não foi possível carregar a revisão' },
    catalog: { loading: 'Carregando o catálogo', error: 'Não foi possível carregar o catálogo' },
    recipes: { loading: 'Carregando os presets', error: 'Não foi possível carregar os presets' },
    schedules: { loading: 'Carregando os agendamentos', error: 'Não foi possível carregar os agendamentos' },
    curations: { loading: 'Carregando a proposta do curador', error: 'Não foi possível carregar a proposta do curador' },
    comparisons: { loading: 'Carregando as comparações', error: 'Não foi possível carregar as comparações' },
    insights: { loading: 'Calculando os indicadores', error: 'Não foi possível calcular os indicadores' },
    accounts: { loading: 'Carregando as contas', error: 'Não foi possível carregar as contas' },
  },
  /** Eyebrow line of each section's cinema banner (StudioHero). */
  heroEyebrows: {
    runs: 'Sala de produção',
    create: 'Novo vídeo',
    review: 'Sala de revisão',
    recipes: 'Roteiros de produção',
    schedules: 'Agenda de produção',
    comparisons: 'Sala de comparação',
    metrics: 'Bilheteria',
    insights: 'Bilheteria',
    curations: 'Curadoria',
    accounts: 'Canais de distribuição',
    catalog: 'Acervo do estúdio',
    skills: 'Estúdio de vídeo',
  },
} as const;
