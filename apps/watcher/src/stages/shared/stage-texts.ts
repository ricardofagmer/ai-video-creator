import { HYPERFRAMES_PIN, type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { type ProviderName, type StageId } from '@studio/shared/run-format';

/**
 * Owner-facing pt-BR texts of the stage executors (D16). They name assets by `assetId@version`
 * and files by run-relative path; they never carry a secret, a biometric path or upstream text.
 */
export const stageTexts = {
  mockFault: (stageId: StageId): string => `Falha simulada (step-failure) na etapa ${stageId}.`,
  mockAuthentication: (provider: ProviderName): string => `Autenticação simulada recusada por ${provider}.`,
  notApplicable: (stageId: StageId): string => `Esta verificação não se aplica à etapa ${stageId}.`,
  toolFailed: (what: string): string => `A ferramenta local falhou: ${what}.`,
  toolTimedOut: (what: string): string => `A ferramenta local passou do tempo limite: ${what}.`,
  missingInput: (name: string): string => `A saída "${name}" de uma etapa anterior não está registrada nesta execução.`,
  missingInputWhatToDo: 'Reabra a etapa que produz essa saída ou habilite-a na receita, e retome a execução.',
  noSourceUrl: 'O brief não tem sourceUrl; nada foi capturado.',
  siteCaptureSkipped: 'O dono escolheu não usar capturas do site; nada foi gravado.',
  siteCaptureFailed: 'A página do site não pôde ser gravada, e o dono pediu capturas do site no vídeo.',
  siteCaptureFailedWhatToDo: 'Confira se a página abre sem login. Para seguir sem ela, cancele e crie o vídeo com uma imagem ou um clipe.',
  captureBlocked: 'A captura tentou sair do domínio do sourceUrl ou usar um endereço não permitido, e foi recusada.',
  captureBlockedWhatToDo: 'Confira o sourceUrl do brief (https; http só em endereço local ou de rede interna) e retome a execução.',
  keyMessagesDropped: (statements: readonly string[]): string =>
    `Removida(s) por falta de evidência na página: ${statements.map((statement) => `"${statement.slice(0, 80)}"`).join(', ')}.`,
  claimsStatedByOwner: (count: number): string =>
    `Sem URL de origem: ${count} mensagem(ns)-chave aceita(s) como afirmação do dono, sem conferência com uma fonte.`,
  refsUnresolved: (problems: readonly string[]): string => `Referências que não resolvem: ${problems.join('; ')}.`,
  voiceNotBound: 'Nenhuma voz vinculada à receita para a narração ao vivo.',
  voiceNotBoundWhatToDo: 'Vincule uma voz (ElevenLabs ou a voz local) na receita, ou use o modo simulado, e retome.',
  localVoiceNotConfigured: 'A voz local não está configurada (LOCAL_VOICE_PYTHON e LOCAL_VOICE_SCRIPT).',
  localVoiceFailed: (reason: string): string => `A voz local não gerou a narração (${reason}).`,
  biometricWhatToDo: 'Confira a voz local e confirme uma nova tentativa da narração; ela nunca é repetida automaticamente.',
  localVoiceReferenceUnresolved: (ref: string): string =>
    `A voz clonada ${ref} não tem um caminho de referência registrado utilizável; nada foi enviado à voz local.`,
  localVoiceReferenceUnresolvedWhatToDo:
    'Confira no catálogo o registro por referência da voz clonada e confirme uma nova tentativa da narração; ela nunca é repetida automaticamente.',
  elevenLabsUnpriced: 'A ElevenLabs não tem preço na tabela de preços; o modo ao vivo fica bloqueado para não gastar sem registro.',
  elevenLabsUnpricedWhatToDo: 'Adicione o preço por caractere da ElevenLabs à tabela de preços, ou use o modo simulado, e retome.',
  elevenLabsVoiceMissing: 'A voz ElevenLabs não tem um id de voz definido.',
  elevenLabsVoiceMissingWhatToDo: 'Cadastre o id público da voz no item do catálogo, ou defina elevenLabsVoiceId em providers.json (ou ELEVENLABS_VOICE_ID no ambiente do watcher), e retome a execução.',
  templateNotRenderable: (ref: string): string => `O modelo ${ref} não é renderizável pelo @ace/video nesta versão.`,
  templateNotRenderableWhatToDo: 'Vincule um modelo Remotion suportado (ToolDemo, AiBattle, AutomationBlueprint ou ProductTour16x9) ou use o modo simulado.',
  hyperframesRendering: (ref: string): string => `Renderizando o modelo ${ref} (HyperFrames).`,
  hyperframesBackground: (shown: number, total: number): string =>
    shown === 0 ? 'Nenhuma cena tem captura ou imagem: o fundo fica liso.' : `Fundo do vídeo: ${shown} de ${total} trecho(s) com a captura do site ou uma imagem escolhida.`,
  templateNotBound: 'Nenhum modelo (template) vinculado à receita.',
  templateNotBoundWhatToDo: 'Vincule um modelo à receita e retome a execução.',
  brandKitNotBound: 'Nenhum brand kit vinculado à receita para o diretor de cenas.',
  brandKitNotBoundWhatToDo: 'Vincule um brand kit à receita e retome a execução.',
  musicNotBound: 'Nenhuma trilha (music) vinculada à receita.',
  musicNotBoundWhatToDo: 'Vincule uma trilha à receita ou desligue a etapa music, e retome.',
  musicAutoNoMatchWhatToDo:
    'Vincule uma trilha à receita, adicione as categorias pedidas a trilhas do catálogo, ou conecte a ElevenLabs para gerar a trilha, e retome.',
  musicGenerationNotConnected: 'Nenhuma trilha do catálogo combina com as categorias pedidas e a ElevenLabs não está conectada para gerar uma.',
  musicGenerationUnpriced:
    'Nenhuma trilha do catálogo combina com as categorias pedidas, e a geração de música da ElevenLabs não tem preço na tabela de preços; nada foi gerado para não gastar sem registro.',
  musicGenerationUnpricedWhatToDo:
    'Vincule uma trilha à receita, adicione as categorias pedidas a trilhas do catálogo, ou adicione o preço da geração de música da ElevenLabs à tabela de preços, e retome.',
  musicGenerationRefused: 'A ElevenLabs recusou gerar a trilha ou devolveu um arquivo que não é áudio MP3.',
  musicTrackUnresolved: (ref: string, status: string): string => `A trilha ${ref} escolhida no catálogo não pôde ser usada (${status}); nada foi mixado.`,
  musicTrackUnresolvedWhatToDo: 'Confira a trilha no catálogo (o arquivo mudou ou sumiu), crie uma nova versão ou vincule outra trilha à receita, e retome.',
  musicPickedFromCatalog: (ref: string, reason: string): string => `Trilha ${ref} escolhida: ${reason}`,
  musicPickReused: (ref: string): string => `Trilha ${ref} reaproveitada da escolha registrada nesta execução.`,
  musicGenerating: (seconds: number): string => `Nenhuma trilha do catálogo combina; gerando uma trilha de ${seconds.toFixed(0)} s.`,
  musicGeneratedTrack: (seconds: number, engine: string): string => `Trilha de ${seconds.toFixed(0)} s gerada (${engine}).`,
  musicReasonOnlyMatch: 'a única trilha do catálogo com as categorias pedidas.',
  musicReasonRule: 'regra de desempate (mais categorias em comum, depois duração mais próxima do vídeo).',
  musicReasonGenerated: (categories: readonly string[]): string =>
    categories.length === 0 ? 'nenhuma trilha no catálogo; trilha gerada sem categoria definida.' : `nenhuma trilha no catálogo combina; trilha gerada para: ${categories.join(', ')}.`,
  noVideoInput: 'Nenhum vídeo de etapa anterior está registrado para esta etapa.',
  qaFailed: (checkIds: readonly string[]): string => `O QA técnico reprovou o vídeo: ${checkIds.join(', ')}.`,
  qaNotPassed: 'O pacote só é montado depois que o QA técnico mede o vídeo.',
  checkNotPassedWarning: (checkId: string, expected: string, measured: string): string =>
    `${checkId} reprovada: esperado ${expected}, medido ${measured}.`,
  qaNotPassedWhatToDo: 'Veja qa/media-review.json, corrija a etapa indicada e retome a execução.',
  qaSubjectChanged: 'O vídeo mudou depois do QA técnico; o pacote não envia um arquivo não medido.',
  pricingUnavailable: (what: string): string => `Sem preço para ${what} na tabela de preços.`,
  pricingUnavailableWhatToDo: 'Adicione o preço que falta à tabela de preços, ou use o modo simulado, e retome.',
  narrationEmpty: 'O roteiro não tem nenhuma fala para narrar.',
  narrationEmptyWhatToDo: 'Reabra a etapa script para gerar um roteiro com narração e retome.',
  reviewerContinued: (overall: number, issues: readonly string[]): string =>
    `Execução seguiu com a melhor versão (nota do revisor ${overall}); revise com atenção${issues.length > 0 ? `: ${issues.join('; ')}` : '.'}`,
  reviewerUnavailableWarning: 'Revisão automática indisponível; revise com atenção.',
  planFallbackWhatToDo: 'Plano padrão da receita usado; confira o plano antes de aprovar.',
  siteAnalysisSwitchedOff: 'Análise do site com IA desligada na receita.',
  siteAnalysisNotHttps: 'O sourceUrl não é um endereço que o estúdio lê (https, ou http local); a análise do site com IA foi pulada.',
  siteAnalysisMock: 'Análise do site simulada, com captura de tela de exemplo, sem acessar a página.',
  siteAnalysisWritten: (withScreenshot: boolean): string =>
    withScreenshot ? 'Site analisado pela IA com o texto e a captura de tela.' : 'Site analisado pela IA só com o texto da página.',
  siteAnalysisUnavailable: (cause: string): string =>
    `Aviso: a análise do site com IA não foi feita (${cause}); a pesquisa segue só com o texto da página.`,
  siteScreenshotUnavailable: 'A captura de tela da página não foi feita; a análise segue só com o texto.',
  siteAnalysisInvalid: 'Aviso: a análise do site (site-analysis.json) não é válida e foi ignorada.',
  referenceAnalysesInvalid: 'Aviso: as análises das referências (reference-analyses.json) não são válidas e foram ignoradas.',
};

/** SPEC 0008 section 5.7: what stopped a HyperFrames render, and what the owner does next. */
export function hyperframesRefusalText(reason: HyperframesRefusalReason, ref: string): { message: string; whatToDo: string } {
  switch (reason) {
    case 'engine-disabled':
      return {
        message: 'O motor HyperFrames está desligado.',
        whatToDo: 'Rode `studio hyperframes status` e siga os passos, ou vincule um modelo Remotion.',
      };
    case 'chrome-missing':
      return { message: 'O Chrome do HyperFrames não está instalado.', whatToDo: 'Rode `studio hyperframes chrome install`.' };
    case 'runtime-not-prepared':
      return { message: 'A pasta de configuração do HyperFrames não foi preparada.', whatToDo: 'Rode `studio hyperframes chrome install`.' };
    case 'trace-missing':
    case 'trace-stale':
      return {
        message: 'A verificação de rede do HyperFrames não foi feita para esta versão.',
        whatToDo: 'Rode `studio hyperframes trace` e depois `studio hyperframes enable`.',
      };
    case 'pin-mismatch':
      return {
        message: `A versão instalada do HyperFrames não é a aprovada (${HYPERFRAMES_PIN}).`,
        whatToDo: 'Reinstale as dependências do estúdio.',
      };
    case 'sandbox-unavailable':
      return {
        message: 'O isolamento de rede do macOS não está disponível.',
        whatToDo: 'O motor HyperFrames não roda sem ele. Use um modelo Remotion.',
      };
    case 'template-not-flat':
    case 'template-not-self-contained':
      return { message: `O modelo ${ref} não segue as regras de um modelo HyperFrames.`, whatToDo: 'Corrija o modelo e crie uma nova versão.' };
    case 'canvas-mismatch':
      return { message: `O modelo ${ref} não renderiza no formato desta receita.`, whatToDo: 'Use o formato do modelo ou vincule outro modelo.' };
    case 'duration-out-of-range':
      return { message: `A narração tem duração fora do intervalo do modelo ${ref}.`, whatToDo: 'Ajuste o roteiro ou vincule outro modelo.' };
    case 'variable-missing':
    case 'variable-undeclared':
    case 'variable-type':
      return {
        message: `As variáveis do modelo ${ref} não puderam ser preenchidas.`,
        whatToDo: 'Confira `templateVariables` na etapa de composição da receita.',
      };
  }
}
