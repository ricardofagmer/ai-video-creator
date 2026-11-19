import {
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  PLANNER_ROLE,
  RECOVERY_ROLE,
  WRITER_ROLE,
  type ModelRoleName,
} from '@studio/shared/agents';
import { type StageId } from '@studio/shared/run-format';
import { type ProviderFailure } from '../../providers';
import { type AgentFailure } from '../agents.errors';

/**
 * Topology section 9: what the engine does when an agent call fails after the agent's own
 * retries. `AgentsService.run` only rejects with a typed `AgentRunError`; the engine applies this
 * table, writes the typed cause to run.json and events.jsonl, and never shows it as success.
 */
export type AgentFailureResponse =
  /** Planner: deterministic default plan from the recipe, with a warning in the report. */
  | 'fallback-default-plan'
  /** Scriptwriter, Scene director, Recovery: the run goes to `waiting`. */
  | 'waiting'
  /** Reviewer: the stage continues without a revision loop; the owner review gate still follows. */
  | 'warning';

export const agentFailurePolicy: Readonly<Record<ModelRoleName, AgentFailureResponse>> = {
  [PLANNER_ROLE]: 'fallback-default-plan',
  [WRITER_ROLE]: 'waiting',
  [DIRECTOR_ROLE]: 'waiting',
  [EVALUATOR_ROLE]: 'warning',
  [RECOVERY_ROLE]: 'waiting',
};

function providerCauseText(failure: ProviderFailure): string {
  switch (failure.class) {
    case 'authentication':
      return 'a chave de API da Anthropic foi recusada';
    case 'rate-limit':
      return 'o limite de requisições da Anthropic foi atingido';
    case 'transient':
      return 'a Anthropic ficou indisponível';
    case 'cancelled':
      return 'a chamada ao modelo foi interrompida';
    case 'fatal':
      return 'a Anthropic recusou a requisição';
  }
}

/** Owner-facing pt-BR cause (D16), from the failure kind only; no upstream text is quoted. */
export function ownerCauseText(failure: AgentFailure): string {
  switch (failure.kind) {
    case 'invalid-packet':
      return 'o pacote de entrada do agente é inválido';
    case 'invalid-output':
      return 'a resposta do modelo não seguiu o formato esperado, mesmo após uma nova tentativa';
    case 'provider':
      return providerCauseText(failure.failure);
    case 'budget-exceeded':
      if (failure.bound === 'tokens') return 'o limite de tokens da chamada foi atingido';
      if (failure.bound === 'usd') return 'o limite de custo da chamada foi atingido';
      return 'o limite de chamadas de ferramenta foi atingido';
    case 'timeout':
      return 'o tempo limite da chamada foi atingido';
    case 'cancelled':
      return 'a execução foi interrompida';
    case 'output-rejected':
      if (failure.reason === 'secret') return 'a resposta continha um segredo e foi descartada';
      if (failure.reason === 'biometric') return 'a resposta citava um caminho biométrico e foi descartada';
      if (failure.reason === 'delimiter-leak') return 'a resposta repetia marcadores de conteúdo não confiável e foi descartada';
      return 'a verificação da resposta falhou e ela foi descartada';
    case 'redaction-failed':
      return 'a remoção de dados sensíveis falhou';
    case 'configuration':
      if (failure.reason === 'model-binding') return 'o modelo vinculado na receita é inválido';
      if (failure.reason === 'model-unpriced') return 'o modelo não tem preço na tabela de preços';
      return 'as ferramentas do agente não estão disponíveis';
    case 'trace-failed':
      return 'o registro da sessão ou do custo falhou';
    case 'internal':
      return 'erro interno do agente';
  }
}

/** "Plano gerado pelo padrão da receita; o planejador falhou: <causa>." */
export function plannerFallbackText(cause: string): string {
  return `Plano gerado pelo padrão da receita; o planejador falhou: ${cause}.`;
}

/** "Roteiro não gerado: <causa>. Ajuste o brief ou tente de novo." */
export function scriptNotGeneratedText(cause: string): string {
  return `Roteiro não gerado: ${cause}. Ajuste o brief ou tente de novo.`;
}

/** "Cenas não definidas: <causa>. Tente de novo ou escolha as capturas." */
export function scenesNotDefinedText(cause: string): string {
  return `Cenas não definidas: ${cause}. Tente de novo ou escolha as capturas.`;
}

/** Reviewer degrade-to-warning text. */
export const REVIEW_UNAVAILABLE_TEXT = 'Revisão automática indisponível nesta etapa; revise com atenção.';

function withoutFinalPeriod(text: string): string {
  return text.trim().replace(/\.+$/, '');
}

/** "Etapa <x> falhou: <motivo original>. O que fazer: <whatToDo>." */
export function recoveryFailedText(stageId: StageId, originalReason: string, whatToDo: string): string {
  return `Etapa ${stageId} falhou: ${withoutFinalPeriod(originalReason)}. O que fazer: ${withoutFinalPeriod(whatToDo)}.`;
}

/** `whatToDo` when Recovery itself failed and so gave none. */
export const RECOVERY_FAILED_WHAT_TO_DO = 'Confira o motivo da falha da etapa e retome a execução.';

/** "O revisor ainda vê problemas: <issues>. Continuar assim ou editar?" */
export function revisionsExhaustedText(issues: readonly string[]): string {
  return `O revisor ainda vê problemas: ${issues.join('; ')}. Continuar assim ou editar?`;
}
