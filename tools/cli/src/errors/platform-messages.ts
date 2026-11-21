import {
  InvalidPlatformInputError,
  InvalidPlatformModeConfigError,
  PlatformFileCorruptError,
  PlatformRefusedError,
  PlatformRowCorruptError,
  PublishAttemptNotFoundError,
  PublishRequestWriteFailedError,
  TokenVaultUnavailableError,
} from '@studio/core/platforms';
import { PLATFORM_LABELS, refusalText } from '../platforms/platform-labels.js';

/**
 * pt-BR text for the platform domain errors (SPEC 0007 section 4.4, K7). A refusal prints the
 * verbatim C10 rev 7 text the web shows. Every field used is a platform name, an id, a file name,
 * a variable name or a reason id: never a token, a code, a URL, a title or an account label.
 * Returns null for an error this table does not know.
 */
export function describePlatformError(error: unknown): string | null {
  // The account's mode is not on the error; "diferente" reads correctly for `platform-mode-mismatch`.
  if (error instanceof PlatformRefusedError) return refusalText(error.reason, { platform: error.platform, accountMode: null });
  if (error instanceof TokenVaultUnavailableError) {
    const exit = error.exitCode === null ? '' : `, saída ${error.exitCode}`;
    return `${refusalText('keychain-unavailable', { platform: error.platform, accountMode: null })} (${PLATFORM_LABELS[error.platform]}: ${error.operation}, ${error.failure}${exit})`;
  }
  if (error instanceof PublishAttemptNotFoundError) return `Envio ${error.attemptId} não encontrado na execução ${error.runId}.`;
  if (error instanceof PublishRequestWriteFailedError) {
    return `O pedido ${error.attemptId} não pôde ser gravado e foi marcado como falho; nada será enviado. Tente de novo.`;
  }
  if (error instanceof PlatformFileCorruptError) {
    return `O arquivo de plataforma ${error.file} (${error.subjectId}) não confere com o contrato; veja "studio doctor".`;
  }
  if (error instanceof PlatformRowCorruptError) return `O registro do envio ${error.attemptId} não confere com o contrato; veja "studio doctor".`;
  if (error instanceof InvalidPlatformInputError) return `Dados inválidos em: ${error.issues.map((issue) => issue.path || '<raiz>').join(', ')}.`;
  if (error instanceof InvalidPlatformModeConfigError) return `A variável ${error.variable} tem um valor inválido; use mock ou live.`;
  return null;
}
