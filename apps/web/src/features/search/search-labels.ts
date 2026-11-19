import { type AssetVersionView, type SearchIndexStatusResponse } from '@studio/shared/api';

/** `AssetVersionView.searchIndex` in pt-BR (SPEC 0003 section 5.2, "When"). */
export const searchIndexLabels: Readonly<Record<AssetVersionView['searchIndex'], string>> = {
  indexed: 'Indexada',
  pending: 'Na fila para indexar',
  stale: 'Indexada por um modelo antigo, na fila para reindexar',
  unavailable: 'Indisponível: o modelo local não está pronto',
};

/** `SearchIndexStatusResponse.model` in pt-BR; `absent` and `rejected` make the mode unavailable. */
export const searchModelLabels: Readonly<Record<SearchIndexStatusResponse['model'], string>> = {
  ready: 'Modelo local pronto',
  absent: 'O modelo local de busca não está instalado. Rode `studio models fetch` e confira com `studio doctor`.',
  rejected: 'O modelo local de busca falhou na verificação de integridade e não foi carregado. Confira com `studio models verify`.',
};

const countFormatter = new Intl.NumberFormat('pt-BR');

/** "3 versões ainda não indexadas" / "1 versão ainda não indexada"; null when nothing is pending. */
export function pendingIndexText(pending: number): string | null {
  if (pending <= 0) return null;
  return pending === 1 ? '1 versão ainda não indexada' : `${countFormatter.format(pending)} versões ainda não indexadas`;
}

const similarityFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Similaridade 0,82": shown as returned; there is no threshold (B10). */
export function similarityText(similarity: number): string {
  return `Similaridade ${similarityFormatter.format(similarity)}`;
}
