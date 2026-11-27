import { ContentTooLargeError, SourceNotFoundError, UnsafePathError } from '@studio/core/asset-store';
import {
  AssetAlreadyExistsError,
  AssetNotFoundError,
  AssetVersionNotFoundError,
  BiometricRequiresReferenceError,
  InvalidAssetInputError,
  LayoutNotAllowedError,
  MimeTypeNotAllowedError,
  type InputIssue,
} from '@studio/core/catalog';
import { EmbeddingUnavailableError, InvalidModelManifestError, InvalidSemanticSearchError } from '@studio/core/embeddings';
import { RecipeBindingInvalidError, RecipeVersionNotFoundError } from '@studio/core/recipes';
import { InvalidReviewInputError, ReviewNotAllowedError, ReviewRunNotFoundError } from '@studio/core/review';
import {
  BriefInputsMissingError,
  InvalidRunInputError,
  RecipeNotRunnableError,
  RunNotFoundError,
  RunOwnedByWatcherError,
  RunReferenceNotFoundError,
  RunStatusConflictError,
} from '@studio/core/runs';
import { KeychainUnavailableError, KeychainWriteNeedsTerminalError, MalformedSecretError } from '@studio/core/secrets';
import { cliText } from '../i18n/messages.js';
import { formatBytes, runStatusLabel } from '../output/format.js';
import { describeOutsideSignalError } from './outside-signal-messages.js';
import { describePlatformError } from './platform-messages.js';

function describeIssues(issues: readonly InputIssue[]): string {
  const root = cliText().errors.domain.root;
  return issues
    .slice(0, 8)
    .map((issue) => `${issue.path || root}: ${issue.message}`)
    .join('; ');
}

/**
 * Text for the core domain errors the CLI commands meet most, in the active language (D16). Every field used here
 * is an id, ref, status, kind or count; none is a path, a key or file content. Returns null for an
 * error this table does not know; the caller then uses the category fallback.
 */
export function describeDomainError(error: unknown): string | null {
  const text = cliText().errors.domain;
  if (error instanceof ReviewNotAllowedError) {
    return text.reviewNotAllowed(error.runId, runStatusLabel(error.status), text.reviewRefusals[error.reason]);
  }
  if (error instanceof ReviewRunNotFoundError || error instanceof RunNotFoundError) return text.runNotFound(error.runId);
  if (error instanceof InvalidReviewInputError || error instanceof InvalidRunInputError) return text.invalidData(describeIssues(error.issues));
  if (error instanceof RunOwnedByWatcherError) return text.runOwnedByWatcher(error.runId);
  if (error instanceof RunStatusConflictError) {
    return text.runStatusConflict(error.runId, runStatusLabel(error.status), runStatusLabel(error.expected));
  }
  if (error instanceof RecipeNotRunnableError) return text.recipeNotRunnable(error.ref, error.status);
  if (error instanceof RecipeVersionNotFoundError) return text.recipeNotFound(error.ref);
  if (error instanceof BriefInputsMissingError) return text.briefInputsMissing(error.ref, error.missing.join(', '));
  if (error instanceof RunReferenceNotFoundError) return text.referencesNotFound(error.refs.join(', '));
  if (error instanceof RecipeBindingInvalidError) return text.bindingsInvalid(error.problems.map((item) => item.ref).join(', '));
  if (error instanceof AssetAlreadyExistsError) return text.assetExists(error.assetId);
  if (error instanceof AssetNotFoundError) return text.assetNotFound(error.assetId);
  if (error instanceof AssetVersionNotFoundError) return text.versionNotFound(error.ref);
  if (error instanceof InvalidAssetInputError) return text.invalidMetadata(describeIssues(error.issues));
  if (error instanceof MimeTypeNotAllowedError) return text.mimeNotAllowed(error.mimeType, error.kind);
  if (error instanceof LayoutNotAllowedError) return text.layoutNotAllowed(error.kind, error.layout === 'file' ? 'file' : 'folder');
  if (error instanceof BiometricRequiresReferenceError) return text.biometricByReference;
  if (error instanceof ContentTooLargeError) return text.contentTooLarge(formatBytes(error.limitBytes));
  if (error instanceof SourceNotFoundError) return text.sourceNotFound;
  if (error instanceof UnsafePathError) return text.unsafePath(error.reason);
  if (error instanceof KeychainWriteNeedsTerminalError) return text.keychainNeedsTerminal;
  if (error instanceof KeychainUnavailableError) return text.keychainUnavailable(error.secretName, error.reason, error.exitCode);
  if (error instanceof EmbeddingUnavailableError) return text.embeddingUnavailable(error.modelState === 'absent' ? 'absent' : 'rejected');
  // Paths of the request fields only: the query text is never echoed (SPEC 0003 section 6).
  if (error instanceof InvalidSemanticSearchError) return text.invalidSearch(error.issues.map((issue) => issue.path || text.root).join(', '));
  if (error instanceof InvalidModelManifestError) return text.invalidModelManifest(error.reason);
  if (error instanceof MalformedSecretError) return text.malformedSecret(error.secretName, error.source);
  return describeOutsideSignalError(error) ?? describePlatformError(error);
}
