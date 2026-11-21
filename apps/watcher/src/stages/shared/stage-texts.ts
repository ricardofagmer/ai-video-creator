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
  captureBlocked: 'A captura tentou sair do domínio do sourceUrl ou usar um endereço local, e foi recusada.',
  captureBlockedWhatToDo: 'Confira o sourceUrl do brief (https, domínio público) e retome a execução.',
  claimsWithoutEvidence: (claimIds: readonly string[]): string =>
    `Afirmações sem evidência na página capturada: ${claimIds.join(', ')}.`,
  claimsWithoutEvidenceWhatToDo: 'Ajuste as mensagens-chave do brief ou o sourceUrl para uma página que as comprove, e retome.',
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
  elevenLabsVoiceMissing: 'ELEVENLABS_VOICE_ID não está definido para a voz ElevenLabs.',
  elevenLabsVoiceMissingWhatToDo: 'Defina ELEVENLABS_VOICE_ID no ambiente do watcher e retome a execução.',
  templateNotRenderable: (ref: string): string => `O modelo ${ref} não é renderizável pelo @ace/video nesta versão.`,
  templateNotRenderableWhatToDo: 'Vincule um modelo Remotion suportado (ToolDemo, AiBattle, AutomationBlueprint ou ProductTour16x9) ou use o modo simulado.',
  hyperframesRendering: (ref: string): string => `Renderizando o modelo ${ref} (HyperFrames).`,
  templateNotBound: 'Nenhum modelo (template) vinculado à receita.',
  templateNotBoundWhatToDo: 'Vincule um modelo à receita e retome a execução.',
  brandKitNotBound: 'Nenhum brand kit vinculado à receita para o diretor de cenas.',
  brandKitNotBoundWhatToDo: 'Vincule um brand kit à receita e retome a execução.',
  musicNotBound: 'Nenhuma trilha (music) vinculada à receita.',
  musicNotBoundWhatToDo: 'Vincule uma trilha à receita ou desligue a etapa music, e retome.',
  noVideoInput: 'Nenhum vídeo de etapa anterior está registrado para esta etapa.',
  qaFailed: (checkIds: readonly string[]): string => `O QA técnico reprovou o vídeo: ${checkIds.join(', ')}.`,
  qaNotPassed: 'O pacote só é montado depois que o QA técnico aprova o vídeo.',
  qaNotPassedWhatToDo: 'Veja qa/media-review.json, corrija a etapa indicada e retome a execução.',
  qaSubjectChanged: 'O vídeo mudou depois do QA técnico; o pacote não envia um arquivo não medido.',
  pricingUnavailable: (what: string): string => `Sem preço para ${what} na tabela de preços.`,
  pricingUnavailableWhatToDo: 'Adicione o preço que falta à tabela de preços, ou use o modo simulado, e retome.',
  narrationEmpty: 'O roteiro não tem nenhuma fala para narrar.',
  narrationEmptyWhatToDo: 'Reabra a etapa script para gerar um roteiro com narração e retome.',
  revisionsExhaustedWhatToDo: 'Revise o resultado e decida: continuar assim, editar o brief ou tentar de novo.',
  reviewerUnavailableWarning: 'Revisão automática indisponível; revise com atenção.',
  planFallbackWhatToDo: 'Plano padrão da receita usado; confira o plano antes de aprovar.',
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
