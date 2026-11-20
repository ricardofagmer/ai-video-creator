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
import { InvalidReviewInputError, ReviewNotAllowedError, ReviewRunNotFoundError, type ReviewRefusalReason } from '@studio/core/review';
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
import { RUN_STATUS_LABELS, formatBytes } from '../output/format.js';
import { describeOutsideSignalError } from './outside-signal-messages.js';

function describeIssues(issues: readonly InputIssue[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => `${issue.path || '<raiz>'}: ${issue.message}`)
    .join('; ');
}

const reviewRefusals: Readonly<Record<ReviewRefusalReason, string>> = {
  'live-watcher': 'o watcher está executando esta execução agora; tente de novo quando o passo terminar',
  status: 'a ação não se aplica ao status atual',
  'gate-not-awaited': 'a execução não está aguardando esta aprovação',
  'already-decided': 'a revisão final já foi registrada com outra decisão',
};

/**
 * pt-BR text for the core domain errors the CLI commands meet most (D16). Every field used here
 * is an id, ref, status, kind or count; none is a path, a key or file content. Returns null for an
 * error this table does not know; the caller then uses the category fallback.
 */
export function describeDomainError(error: unknown): string | null {
  if (error instanceof ReviewNotAllowedError) {
    return `Execução ${error.runId} (${RUN_STATUS_LABELS[error.status]}): ${reviewRefusals[error.reason]}.`;
  }
  if (error instanceof ReviewRunNotFoundError || error instanceof RunNotFoundError) return `Execução ${error.runId} não encontrada.`;
  if (error instanceof InvalidReviewInputError || error instanceof InvalidRunInputError) {
    return `Dados inválidos: ${describeIssues(error.issues)}.`;
  }
  if (error instanceof RunOwnedByWatcherError) return `O watcher está executando a execução ${error.runId}; tente quando ele parar.`;
  if (error instanceof RunStatusConflictError) {
    return `A execução ${error.runId} está ${RUN_STATUS_LABELS[error.status]}; esperado ${RUN_STATUS_LABELS[error.expected]}.`;
  }
  if (error instanceof RecipeNotRunnableError) return `A receita ${error.ref} está ${error.status}; use uma versão rascunho ou ativa.`;
  if (error instanceof RecipeVersionNotFoundError) return `Receita ${error.ref} não encontrada.`;
  if (error instanceof BriefInputsMissingError) return `A receita ${error.ref} exige no brief: ${error.missing.join(', ')}.`;
  if (error instanceof RunReferenceNotFoundError) return `Referências não encontradas no catálogo: ${error.refs.join(', ')}.`;
  if (error instanceof RecipeBindingInvalidError) {
    return `Os vínculos da receita não conferem com o catálogo: ${error.problems.map((item) => item.ref).join(', ')}.`;
  }
  if (error instanceof AssetAlreadyExistsError) return `O asset ${error.assetId} já existe; salve uma nova versão pelo web.`;
  if (error instanceof AssetNotFoundError) return `Asset ${error.assetId} não encontrado.`;
  if (error instanceof AssetVersionNotFoundError) return `Versão ${error.ref} não encontrada.`;
  if (error instanceof InvalidAssetInputError) return `Metadados inválidos: ${describeIssues(error.issues)}.`;
  if (error instanceof MimeTypeNotAllowedError) return `O tipo ${error.mimeType} não é aceito para ${error.kind}.`;
  if (error instanceof LayoutNotAllowedError) return `Um asset ${error.kind} não pode ser ${error.layout === 'file' ? 'um arquivo' : 'uma pasta'}.`;
  if (error instanceof BiometricRequiresReferenceError) return 'Material biométrico só entra por referência (--by-reference).';
  if (error instanceof ContentTooLargeError) {
    return `O conteúdo passa do limite de ${formatBytes(error.limitBytes)}; registre por referência (--by-reference).`;
  }
  if (error instanceof SourceNotFoundError) return 'O caminho informado não existe.';
  if (error instanceof UnsafePathError) return `Caminho recusado (${error.reason}).`;
  if (error instanceof KeychainWriteNeedsTerminalError) return 'Guardar uma chave precisa de um terminal interativo; rode no Terminal.';
  if (error instanceof KeychainUnavailableError) {
    return `O Keychain do macOS não pôde ser usado para ${error.secretName} (${error.reason}${error.exitCode === null ? '' : `, saída ${error.exitCode}`}).`;
  }
  if (error instanceof EmbeddingUnavailableError) {
    const state = error.modelState === 'absent' ? 'ausente' : 'recusado (os arquivos não conferem com o manifesto)';
    return `A busca por significado está indisponível: o modelo de busca está ${state}. Veja "studio models status".`;
  }
  // Paths of the request fields only: the query text is never echoed (SPEC 0003 section 6).
  if (error instanceof InvalidSemanticSearchError) return `Busca inválida em: ${error.issues.map((issue) => issue.path || '<raiz>').join(', ')}.`;
  if (error instanceof InvalidModelManifestError) return `O manifesto do modelo de busca não pode ser usado (${error.reason}).`;
  if (error instanceof MalformedSecretError) return `A chave ${error.secretName} encontrada em ${error.source} está malformada; defina de novo.`;
  return describeOutsideSignalError(error);
}
