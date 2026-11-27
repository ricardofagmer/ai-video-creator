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
import { cliText } from '../i18n/messages.js';
import { PLATFORM_LABELS, refusalText } from '../platforms/platform-labels.js';

/**
 * Text for the platform domain errors (SPEC 0007 section 4.4, K7). A refusal prints the
 * C10 rev 7 text the web shows (verbatim in pt-BR). Every field used is a platform name, an id, a file name,
 * a variable name or a reason id: never a token, a code, a URL, a title or an account label.
 * Returns null for an error this table does not know.
 */
export function describePlatformError(error: unknown): string | null {
  // The account's mode is not on the error; "diferente" reads correctly for `platform-mode-mismatch`.
  const { errors } = cliText();
  const text = errors.platform;
  if (error instanceof PlatformRefusedError) return refusalText(error.reason, { platform: error.platform, accountMode: null });
  if (error instanceof TokenVaultUnavailableError) {
    const refusal = refusalText('keychain-unavailable', { platform: error.platform, accountMode: null });
    return `${refusal} ${text.keychainOperation(PLATFORM_LABELS[error.platform], error.operation, error.failure, error.exitCode)}`;
  }
  if (error instanceof PublishAttemptNotFoundError) return text.attemptNotFound(error.attemptId, error.runId);
  if (error instanceof PublishRequestWriteFailedError) return text.requestWriteFailed(error.attemptId);
  if (error instanceof PlatformFileCorruptError) return text.fileCorrupt(error.file, error.subjectId);
  if (error instanceof PlatformRowCorruptError) return text.rowCorrupt(error.attemptId);
  if (error instanceof InvalidPlatformInputError) {
    return errors.outsideSignal.invalidDataIn(error.issues.map((issue) => issue.path || errors.domain.root).join(', '));
  }
  if (error instanceof InvalidPlatformModeConfigError) return text.modeConfig(error.variable);
  return null;
}
