import { describeApiError } from '@/features/common/api-error-text';
import { ApiRequestError } from '@/lib/api';

/**
 * pt-BR text for the C10 error `reason`s the runs and review screens meet (apps/api
 * `error-mapping.ts`: the kebab-case name of each core runs and review error). The api's English
 * `message` is never shown; anything not listed here falls back to the shared catalog texts.
 */
const runReasonTexts: Readonly<Record<string, string>> = {
  'recipe-not-runnable': 'Esta versão da receita está descontinuada. Escolha uma versão ativa ou em rascunho.',
  'brief-inputs-missing': 'O briefing não tem tudo o que a receita exige.',
  'run-reference-not-found': 'Uma referência escolhida não existe mais no catálogo.',
  'run-not-found': 'Execução não encontrada.',
  'review-run-not-found': 'Execução não encontrada.',
  'run-status-conflict': 'A execução mudou de status enquanto você agia. Confira o estado atual.',
  'run-owned-by-watcher': 'O watcher está trabalhando nesta execução. Tente de novo em alguns segundos.',
  'review-not-allowed': 'A execução não aceita esta ação agora. Confira o estado atual e tente de novo.',
  'invalid-run-input': 'Alguns campos não foram aceitos.',
  'invalid-review-input': 'Alguns campos não foram aceitos.',
  'required-checklist-unchecked': 'Marque todos os itens obrigatórios para aprovar.',
  'approval-file-full': 'Esta execução já tem o máximo de decisões registradas.',
  'artifact-not-found': 'O arquivo não foi encontrado na pasta da execução.',
  'artifact-not-recorded': 'Este arquivo não foi registrado pela execução.',
  'artifact-changed': 'O arquivo mudou depois de registrado e não pode ser promovido.',
  'unsafe-artifact-path': 'Este arquivo está fora da pasta da execução.',
  'artifact-type-not-supported': 'O catálogo não aceita este tipo de arquivo.',
  'promote-biometric-refused':
    'Material biométrico não vira versão do catálogo: o ativo de destino é biométrico ou esta execução usou um ativo biométrico.',
  'promote-sensitivity-unknown':
    'Não foi possível confirmar a sensibilidade de um ativo usado nesta execução, então a promoção foi recusada por segurança.',
  'run-file-unsupported-format': 'Esta execução usa um formato de arquivo mais novo. Atualize o estúdio.',
};

/** One pt-BR sentence for any failure of a runs or review C10 call. */
export function describeRunError(error: unknown): string {
  if (error instanceof ApiRequestError && error.reason !== null) {
    const known = runReasonTexts[error.reason];
    if (known !== undefined) return known;
  }
  return describeApiError(error);
}

/** The events log was rewritten under the reader; it is read again from byte 0 (C5). */
export function isEventLogReset(error: unknown): boolean {
  return error instanceof ApiRequestError && error.reason === 'run-file-append-only-violated';
}

/** A fetch aborted by its own AbortController (tab hidden, page left): not a failure. */
export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
