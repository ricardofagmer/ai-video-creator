import { type StageFailure } from '@studio/shared/ports';
import { type ProviderName } from '@studio/shared/run-format';
import { requiredCredential } from './provider-credentials';
import { type ProviderFailure } from './provider-failure';

/**
 * Maps a classified provider failure to the C6 `StageFailure` the engine acts on. Messages are
 * built from the provider name and the class only, so no upstream text (which can echo a key or
 * user content) reaches run.json, events or logs.
 */
export function toStageFailure(failure: ProviderFailure): StageFailure {
  const { provider } = failure;
  switch (failure.class) {
    case 'authentication':
      return { class: 'authentication', provider, message: `Provider ${provider} rejected the credential` };
    case 'rate-limit':
      return { class: 'retryable', kind: 'rate-limit', message: `Provider ${provider} is rate limited or overloaded` };
    case 'transient':
      return { class: 'retryable', kind: 'tool', message: `Provider ${provider} failed (${failure.reason})` };
    case 'cancelled':
      return { class: 'retryable', kind: 'timeout', message: `Call to provider ${provider} was cancelled` };
    case 'fatal':
      return { class: 'retryable', kind: 'tool', message: `Provider ${provider} refused the request (${failure.reason})` };
  }
}

/** Owner-facing pt-BR text (D16) for the `waiting` state of an authentication failure (criterion 16). */
export function authenticationWhatToDo(provider: ProviderName): string {
  const secretName = requiredCredential(provider);
  if (secretName === null) {
    return `O provedor ${provider} recusou o acesso. Verifique a configuração dele e retome a execução.`;
  }
  return (
    `O provedor ${provider} recusou a chave de API. Gere uma chave válida, grave com ` +
    `"studio secrets set ${secretName}" (ou defina a variável de ambiente), reinicie o watcher e retome a execução.`
  );
}
