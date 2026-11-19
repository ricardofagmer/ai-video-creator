import { type ApiRev5ErrorReason } from '@studio/shared/api';
import { ApiRequestContractError, ApiRequestError, ApiResponseContractError, ApiUnreachableError } from '@/lib/api';

/** design/telas/01, "Api fora do ar". */
export const API_UNREACHABLE_TEXT = 'Não foi possível falar com o serviço local. Verifique com `studio doctor`.';

/**
 * Rev 5 (SPEC 0006 section 4.4): publications, metrics import and schedules. Nothing is written on
 * any of these. Typed by `ApiRev5ErrorReason`, so a reason added to the contract without a text
 * fails the build. `metrics-required-column-missing` names the platform in the import form, which
 * knows it (`metricImportErrorText`); this generic text covers every other screen.
 */
const rev5ReasonTexts: Readonly<Record<ApiRev5ErrorReason, string>> = {
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
  'schedule-recipe-not-runnable': 'A receita escolhida não pode ser executada.',
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
};

/**
 * pt-BR text for the C10 error `reason`s the catalog and recipe screens can meet. The api's own
 * `message` is English and is never shown; an unknown reason falls back to its status and id.
 */
const reasonTexts: Readonly<Record<string, string>> = {
  'asset-already-exists': 'Este id já existe no catálogo.',
  'recipe-already-exists': 'Este id de receita já existe.',
  'asset-not-found': 'Ativo não encontrado.',
  'asset-version-not-found': 'Versão do ativo não encontrada.',
  'recipe-not-found': 'Receita não encontrada.',
  'recipe-version-not-found': 'Versão da receita não encontrada.',
  'asset-version-conflict': 'O ativo mudou enquanto você editava. Tente de novo.',
  'recipe-version-conflict': 'A receita mudou enquanto você editava. Tente de novo.',
  'license-required': 'Um ativo de terceiros só pode ficar ativo com licença e procedência preenchidas.',
  'invalid-status-transition': 'Esta versão não pode mudar para esse status.',
  'invalid-recipe-status-transition': 'Esta versão da receita não pode mudar para esse status.',
  'mime-type-not-allowed': 'Tipo de arquivo não aceito para este tipo de ativo.',
  'layout-not-allowed': 'Este tipo de ativo não aceita esse formato (arquivo ou pasta).',
  'biometric-requires-reference': 'Material biométrico só entra no catálogo por referência.',
  'biometric-downgrade': 'Este ativo tem material biométrico; as novas versões continuam biométricas.',
  'content-too-large': 'O arquivo passa do limite deste tipo de ativo.',
  'body-too-large': 'O arquivo passa do limite deste tipo de ativo.',
  'upload-rejected': 'O envio foi recusado. Confira o arquivo e tente de novo.',
  'unsafe-path': 'Um nome de arquivo da pasta não é aceito.',
  'unsupported-folder': 'A pasta não pode ser importada.',
  // Rev 4: the by-reference routes give one reason for every refused path, so nothing tells which check failed (A24).
  'reference-path-refused':
    'O caminho não foi aceito. Use um arquivo ou pasta que exista na sua pasta pessoal ou em /Volumes, fora da pasta de dados do estúdio, sem pastas ocultas e sem atalhos (links simbólicos).',
  'source-not-found': 'Nada foi encontrado nesse caminho.',
  'recipe-binding-invalid': 'Um vínculo da receita não corresponde a uma versão do catálogo.',
  'invalid-asset-input': 'Alguns campos não foram aceitos.',
  'invalid-recipe-input': 'Alguns campos não foram aceitos.',
  'invalid-request': 'Alguns campos não foram aceitos.',
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
  'comparison-subject-invalid': 'A comparação não é válida: escolha outra versão do mesmo ativo ou da mesma receita.',
  'comparison-biometric-refused': 'Comparações com material biométrico não são permitidas.',
  'comparison-over-month-ceiling': 'As duas execuções passariam do teto de gasto do mês. Nada foi iniciado.',
  'comparison-estimate-changed': 'O custo máximo mudou desde que a página foi aberta. Confira o valor novo antes de iniciar.',
  'comparison-not-startable': 'Esta comparação já foi iniciada ou uma das execuções não está mais em rascunho.',
  'comparison-not-found': 'Comparação não encontrada.',
  'invalid-comparison-input': 'Alguns campos não foram aceitos.',
  'month-spend-unavailable': 'O gasto do mês não pôde ser lido, então nada foi iniciado. Verifique com `studio doctor`.',
  'embedding-unavailable': 'A busca por significado está indisponível: o modelo local não está pronto. Verifique com `studio doctor`.',
  'invalid-semantic-search': 'A busca não foi aceita. Use de 1 a 500 caracteres.',
  // Rev 4 (SPEC 0005 section 4.4): Curator proposals. Nothing is written or spent on any of these.
  'curation-subject-not-found': 'Versão não encontrada. Recarregue a página.',
  'curation-not-found': 'Proposta do curador não encontrada.',
  'curation-subject-not-curatable': 'O curador só faz propostas para prompts, skills e receitas em rascunho ou ativos.',
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
  'invalid-curation-input': 'Alguns campos não foram aceitos.',
  ...rev5ReasonTexts,
  'origin-not-allowed':'A requisição foi recusada por segurança. Recarregue a página.',
  'api-unreachable': API_UNREACHABLE_TEXT,
};

/** The pt-BR text of one contract reason, for a check the browser makes before calling the api. */
export function apiReasonText(reason: ApiRev5ErrorReason): string {
  return rev5ReasonTexts[reason];
}

/** One pt-BR sentence for any failure of a C10 call. */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiUnreachableError) return API_UNREACHABLE_TEXT;
  if (error instanceof ApiRequestContractError) return 'Alguns campos não foram aceitos.';
  if (error instanceof ApiResponseContractError) return 'O serviço local respondeu num formato inesperado. Verifique com `studio doctor`.';
  if (error instanceof ApiRequestError) {
    const known = error.reason === null ? undefined : reasonTexts[error.reason];
    if (known !== undefined) return known;
    if (error.status === 413) return 'O arquivo passa do limite deste tipo de ativo.';
    if (error.status >= 500) return API_UNREACHABLE_TEXT;
    return `Erro ${error.status}${error.reason === null ? '' : ` (${error.reason})`}.`;
  }
  return 'Ocorreu um erro inesperado.';
}
