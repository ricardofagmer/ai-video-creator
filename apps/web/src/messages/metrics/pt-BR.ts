import { pollRules, type PollStopReason } from '@studio/shared/platforms';
import type { MetricName, MetricRowIssue, MetricSnapshotOrigin, Platform, PublicationOrigin } from '@studio/shared/metrics';

/** Metrics, publications and insights (SPEC 0006). pt-BR is the source of truth for the group's type. */
export const metricsPtBR = {
  import: {
    title: 'Importar métricas',
    description:
      'Envie o CSV que a plataforma exporta. Cada linha é ligada à execução pelo id do vídeo; registre antes a publicação na página da execução aprovada.',
    platform: 'Plataforma',
    platformPlaceholder: 'Selecione…',
    howToExport: (platform: string): string => `Como exportar do ${platform}`,
    asOfDate: 'Números referentes a',
    asOfDateHelp: 'O dia a que os totais da exportação se referem. Nunca no futuro.',
    file: 'Arquivo CSV',
    fileHelp: 'Até 2 MB e 5.000 linhas, em texto UTF-8.',
    check: 'Conferir',
    checking: 'Conferindo…',
    import: 'Importar',
    importing: 'Importando…',
    importAnother: 'Importar outro arquivo',
    reportDryRun: 'Conferência',
    reportDone: 'Resultado da importação',
    errors: {
      platform: 'Escolha a plataforma da exportação.',
      asOfDate: 'Escolha a data dos números.',
      future: 'A data das métricas não pode ser no futuro.',
      file: 'Escolha o arquivo CSV exportado.',
      columnsMissing: (platform: string): string =>
        `Não encontrei as colunas esperadas da exportação de ${platform}. Confira se escolheu a plataforma certa.`,
    },
    /** How to get each export, as plain text (SPEC 0006 sections 5.3 and 5.9). */
    instructions: {
      youtube:
        'No YouTube Studio, abra Análises, entre no Modo avançado e use "Exportar visualização atual" no nível de vídeo. Se o download vier em .zip, abra-o e envie só o arquivo Table data.csv. Relatórios baixados têm no máximo 500 linhas.',
      instagram:
        'No Meta Business Suite, abra Insights, depois Conteúdo, e exporte os dados em CSV. A exportação leva alguns minutos para ficar pronta. O arquivo precisa trazer o link de cada post.',
      tiktok:
        'No TikTok Studio, pelo navegador, abra Análises e baixe os dados dos vídeos. O download cobre os últimos 60 dias. Se vier como planilha .xlsx, salve como CSV (UTF-8) antes de enviar.',
    } satisfies Record<Platform, string>,
    noCredentials:
      'O estúdio nunca pede login, senha ou chave das plataformas: exporte no site da própria plataforma e envie o arquivo aqui.',
  },
  report: {
    platform: 'Plataforma',
    asOfDate: 'Números referentes a',
    rows: 'Linhas lidas',
    matched: 'Com publicação registrada',
    created: (dryRun: boolean): string => (dryRun ? 'Seriam novas' : 'Novas'),
    updated: (dryRun: boolean): string => (dryRun ? 'Seriam atualizadas' : 'Atualizadas'),
    unchanged: 'Sem mudança',
    issuesTotal: 'Linhas com problema',
    ignoredColumns: 'Colunas ignoradas',
    more: (hidden: number): string => `e mais ${hidden}.`,
    scoreRecomputed: 'Importação concluída. As notas das versões usadas foram recalculadas.',
    scoreNotRecomputed:
      'Importação concluída, mas as notas não foram recalculadas agora. Elas serão recalculadas na próxima revisão ou importação; verifique com `studio doctor`.',
    nothingChanged: 'Importação concluída. Nenhuma métrica mudou.',
    dryRunReady: 'Conferência pronta. Nada foi gravado ainda: confira os números e clique em Importar.',
    duplicateFile:
      'Este arquivo já tinha sido importado com esta data. Vídeos registrados desde então podem ser encontrados agora; os outros ficam sem mudança.',
    unmatchedLabel: 'Vídeos sem execução ligada',
    unmatched: 'Vídeos sem execução ligada: registre a publicação na página da execução e importe de novo.',
    issuesLabel: 'Linhas com problema',
    issuesIntro: 'Estas linhas foram puladas; o resto do arquivo foi lido normalmente.',
    issueLine: (line: number, issue: string): string => `Linha ${line}: ${issue}`,
    /** Why an import row was skipped, completing "Linha N: ...". */
    issues: {
      'id-missing': 'sem o id ou o link do vídeo',
      'id-invalid': 'id ou link do vídeo não reconhecido',
      'number-invalid': 'um número não pôde ser lido',
      'date-invalid': 'uma data não pôde ser lida',
      'cell-too-long': 'uma célula passa de 2.000 caracteres',
      'duplicate-row': 'vídeo repetido no arquivo; valeu a primeira linha',
      'views-missing': 'sem o número de visualizações',
    } satisfies Record<MetricRowIssue, string>,
  },
  /** One label per `PlatformMetrics` value, as the manual form and the history table show them. */
  fields: {
    views: 'Visualizações',
    likes: 'Curtidas',
    comments: 'Comentários',
    shares: 'Compartilhamentos',
    saves: 'Salvamentos',
    impressions: 'Impressões',
    reach: 'Alcance',
    followersGained: 'Seguidores ganhos',
    watchTimeSeconds: 'Tempo assistido (horas)',
    averageViewDurationSeconds: 'Duração média assistida',
    averageViewPercent: 'Porcentagem média assistida (%)',
  } satisfies Record<MetricName, string>,
  fieldHelp: {
    watchTimeSeconds: 'Em horas, como no YouTube Studio. Ex.: 12,5',
    averageViewDurationSeconds: 'm:ss ou segundos. Ex.: 0:42',
    averageViewPercent: 'Pode passar de 100 quando o vídeo repete.',
  },
  snapshotForm: {
    heading: 'Métricas',
    headingOn: (date: string): string => `Métricas em ${date}`,
    saved: (date: string): string => `Métricas de ${date} salvas. A nota é recalculada em seguida.`,
    asOfDate: 'Números referentes a',
    asOfDateHelp: 'O dia a que os totais se referem. Nunca no futuro.',
    saving: 'Salvando…',
    save: 'Salvar métricas',
    errors: {
      asOfDate: 'Escolha a data dos números.',
      future: 'A data das métricas não pode ser no futuro.',
      number: 'Número não reconhecido.',
      views: 'Informe as visualizações.',
      outOfRange: 'Valor fora do limite aceito.',
    },
  },
  history: {
    date: 'Data',
    inForce: (date: string): string => `${date} (em vigor)`,
    source: 'Origem',
    engagement: 'Engajamento',
    watched: 'Assistido',
    empty: 'Nenhuma métrica registrada ainda.',
    caption: (platform: string): string => `Métricas de ${platform}`,
    /** Rev 7 (SPEC 0007 section 4.1): how a snapshot arrived. */
    origins: {
      form: 'Formulário',
      'csv-upload': 'CSV',
      api: 'API da plataforma',
    } satisfies Record<MetricSnapshotOrigin, string>,
  },
  publications: {
    title: 'Publicações',
    description:
      'Onde este vídeo foi publicado, pelo estúdio ou por você, e as métricas que entram na nota das versões que ele usou. Publicou por fora? Cole o link abaixo.',
    loadFailed: (detail: string): string => `Não foi possível carregar as publicações. ${detail}`,
    empty: 'Nenhuma publicação registrada.',
    limit: (max: number): string => `Limite de ${max} publicações por execução.`,
    importPrompt: 'Tem a exportação da plataforma? ',
    importLink: 'Importar métricas de um CSV',
    publishedOn: (date: string): string => `Publicado em ${date}`,
    attempt: (attemptId: string): string => `Envio ${attemptId}`,
    lastPolled: (date: string): string => ` · Última coleta: ${date}`,
    opensInNewTab: ' (abre em uma nova aba)',
    recordMetrics: 'Registrar métricas',
    /** Rev 7 (SPEC 0007 sections 4.1 and 5.9): where a publication came from. */
    origins: {
      manual: 'Link colado',
      studio: 'Publicado pelo estúdio',
      mock: 'simulado',
    } satisfies Record<PublicationOrigin, string>,
    baselineMissing: (minVideos: number, platform: string): string =>
      `Sem efeito na nota até haver ${minVideos} vídeos com métricas em ${platform}.`,
    polling: {
      stopped: 'Coleta encerrada',
      stopReasons: {
        'window-closed': `Coleta encerrada: ${pollRules.stopAfterDay} dias`,
        'not-found': 'Coleta encerrada: vídeo não encontrado na plataforma',
        'not-owned': 'Coleta encerrada: o vídeo não é da conta conectada',
        'publication-removed': 'Coleta encerrada: publicação removida',
      } satisfies Record<PollStopReason, string>,
      notPolled: 'Sem coleta automática: registre as métricas pelo formulário ou por CSV.',
      today: 'Próxima coleta: hoje',
      tomorrow: 'Próxima coleta: amanhã',
      on: (date: string): string => `Próxima coleta: ${date}`,
    },
    add: {
      url: 'Link do vídeo publicado',
      urlHelp: 'O link completo do vídeo no YouTube, Instagram ou TikTok. O estúdio só guarda o link; não abre nem publica nada.',
      urlRequired: 'Cole o link do vídeo publicado.',
      publishedOn: 'Publicado em',
      futureDate: 'A data de publicação não pode ser no futuro.',
      saving: 'Registrando…',
      submit: 'Registrar publicação',
    },
    remove: {
      button: 'Remover publicação',
      title: 'Remover a publicação?',
      description: 'Só o registro no estúdio é removido. O vídeo continua publicado na plataforma.',
      cancel: 'Cancelar',
      removing: 'Removendo…',
      confirm: 'Remover',
    },
  },
  /** PRD 0001 R4 goal 4: `/indicadores`. */
  insights: {
    title: 'Indicadores',
    description: 'As metas de sucesso do estúdio, calculadas das execuções que chegaram à revisão.',
    computedAt: (dateTime: string): string => `Calculado em ${dateTime}`,
    truncated: (max: number): string => `Só as ${max} execuções mais recentes que chegaram à revisão entram na conta.`,
    noData: 'sem dados',
    unavailable: 'indisponível',
    verdicts: { noData: 'Sem dados', met: 'Na meta', missed: 'Fora da meta' },
    lessThanMinute: 'menos de 1 min',
    reviewReach: {
      title: 'Revisão sem reparo manual',
      body: (withoutRepair: number, reached: number, target: string): string =>
        `${withoutRepair} de ${reached} execuções chegaram à revisão sem sair de "falhou". Meta: ${target} ou mais.`,
      withoutHistory: (count: number): string => `${count} sem histórico legível ficaram de fora.`,
    },
    catalogShare: {
      title: 'Ativos vindos do catálogo',
      value: (meeting: number, total: number): string => `${meeting} de ${total}`,
      body: (fromRun: number, target: string): string =>
        `Execuções a partir da ${fromRun}ª com ${target} ou mais dos ativos já no catálogo antes de começar.`,
      withoutManifest: (count: number): string => `${count} sem manifesto ficaram de fora.`,
    },
    cost: {
      title: 'Custo por vídeo aprovado',
      body: (approved: number, total: string, limit: string, over: number): string =>
        `${approved} aprovados, ${total} no total. Limite por execução: ${limit}; ${over} acima dele.`,
      month: (spent: string, limit: string): string => `Mês atual: ${spent} de ${limit}.`,
    },
    unapproved: {
      title: 'Publicados sem aprovação',
      body: 'Vídeos publicados cuja execução não tem aprovação registrada. Meta: nenhum.',
    },
    reviewTime: {
      title: 'Tempo do briefing à revisão',
      description: 'Por receita: a execução mais recente contra a primeira.',
      caption: 'Tempo do briefing à revisão, por receita',
      empty: 'Nenhuma execução chegou à revisão ainda.',
      columns: { recipe: 'Receita', runs: 'Execuções', first: 'Primeira', latest: 'Mais recente', verdict: 'Mais rápida que a primeira' },
    },
    ratingTrend: {
      title: 'Tendência de nota',
      description: 'Por receita: média das últimas 5 avaliações contra as 5 anteriores.',
      caption: 'Tendência de nota, por receita',
      empty: 'Nenhuma execução foi avaliada ainda.',
      columns: { recipe: 'Receita', latest: 'Últimas', previous: 'Anteriores', verdict: 'Nota mantida' },
    },
    catalogRuns: {
      title: 'Ativos do catálogo por execução',
      description: 'As execuções mais recentes, com a parcela de ativos que já estava no catálogo.',
      caption: 'Ativos do catálogo nas últimas execuções',
      empty: 'Nenhuma execução com manifesto ainda.',
      columns: { run: 'Execução', ordinal: 'Nº', versions: 'Do catálogo', share: 'Parcela', verdict: 'Meta' },
      versions: (fromCatalog: number, total: number): string => `${fromCatalog} de ${total}`,
    },
  },
} as const;
