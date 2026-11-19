import { type BadgeTone } from '@studio/ui';
import { type CurationView } from '@studio/shared/api';
import {
  type CuratableKind,
  type CurationCheckId,
  type CurationReasonId,
  type CurationStatus,
  type CurationSubject,
} from '@studio/shared/curation';

/** SPEC 0005 section 5.9: the status of a curation, as the list and the page show it. */
const curationStatusLabels: Readonly<Record<CurationStatus, string>> = {
  requested: 'Na fila',
  collecting: 'Em andamento',
  proposed: 'Proposta pronta',
  'no-change': 'Sem mudança',
  'no-proposal': 'Sem proposta',
  failed: 'Falhou',
  refused: 'Recusada antes de começar',
};

export const curationStatusTones: Readonly<Record<CurationStatus, BadgeTone>> = {
  requested: 'neutral',
  collecting: 'info',
  proposed: 'success',
  'no-change': 'neutral',
  'no-proposal': 'warning',
  failed: 'danger',
  refused: 'warning',
};

export const curatableKindLabels: Readonly<Record<CuratableKind, string>> = {
  prompt: 'Prompt',
  skill: 'Skill',
  recipe: 'Receita',
};

/** Which ground check failed, as the `<qual verificação falhou>` of topology 0004 section 9. */
const checkTexts: Readonly<Record<CurationCheckId, string>> = {
  'evidence-in-packet': 'a proposta citou uma execução que não estava entre as evidências',
  'evidence-used-subject': 'a proposta citou uma execução que não usou esta versão',
  'evidence-owner-reviewed': 'a proposta citou uma execução sem uma decisão sua',
  'body-changed': 'o texto proposto é igual ao texto atual',
  'body-within-cap': 'o texto proposto passa de 16.000 caracteres',
  'recipe-json-valid': 'a receita proposta não é uma receita válida',
  'bindings-resolvable': 'a receita proposta vincula uma versão que não existe ou é biométrica',
  'redactor-clean': 'a proposta parecia conter uma senha ou chave',
};

/** Every reason id of `curation.json` (refused, failed or a check id) as a pt-BR phrase. */
const reasonTexts: Readonly<Record<CurationReasonId, string>> = {
  'month-spend-unavailable': 'o gasto do mês não pôde ser lido',
  'over-month-ceiling': 'o pedido passaria do teto de gasto do mês',
  'over-curation-ceiling': 'a chamada ao modelo não caberia no custo máximo de US$ 1,00',
  'packet-secret-found': 'o material que iria para o curador parecia conter uma senha ou chave',
  'redactor-unavailable': 'a verificação contra senhas e chaves não estava disponível',
  'subject-refused': 'a versão não pode mais receber propostas (descontinuada, biométrica ou sem texto)',
  'evidence-unavailable': 'as evidências das execuções revisadas não puderam ser lidas',
  'call-timeout': 'a chamada ao modelo passou de 2 minutos',
  'curation-timeout': 'a curadoria passou de 5 minutos',
  'provider-error': 'o provedor do modelo respondeu com erro',
  'rate-limited': 'o provedor do modelo limitou as chamadas',
  'output-invalid': 'a resposta do modelo veio num formato inválido',
  'watcher-stopped': 'o serviço de execuções foi parado durante a curadoria',
  'watcher-restarted': 'o serviço de execuções reiniciou durante a curadoria',
  'internal-error': 'ocorreu um erro interno',
  ...checkTexts,
};

const UNKNOWN_REASON = 'motivo não informado';

function reasonText(reasonId: CurationReasonId | null): string {
  return reasonId === null ? UNKNOWN_REASON : reasonTexts[reasonId];
}

/** The failed checks of a `no-proposal`, else its reason id. */
function failedChecksText(curation: CurationView): string {
  if (curation.failedChecks.length > 0) return curation.failedChecks.map((check) => checkTexts[check]).join('; ');
  return reasonText(curation.reasonId);
}

/** The template adds its own final period; a model-written reason often ends with one. */
function withoutFinalPeriod(text: string): string {
  return text.trim().replace(/\.+$/, '');
}

/**
 * The owner texts of topology 0004 section 9 for the four outcomes without a proposal, with the
 * reason id mapped to a pt-BR phrase. `noChangeReason` is model-written and stays plain text.
 * Null for every other status.
 */
export function curationOutcomeText(curation: CurationView): string | null {
  switch (curation.status) {
    case 'failed':
      return `O curador não conseguiu propor: ${reasonText(curation.reasonId)}. Nenhuma versão foi criada; você pode pedir de novo.`;
    case 'no-proposal':
      return `O curador não fez uma proposta válida: ${failedChecksText(curation)}. Nenhuma versão foi criada.`;
    case 'no-change':
      return `O curador não vê motivo para uma nova versão: ${withoutFinalPeriod(curation.noChangeReason ?? UNKNOWN_REASON)}.`;
    case 'refused':
      return `Pedido recusado antes de chamar o curador: ${reasonText(curation.reasonId)}. Nada foi gasto.`;
    default:
      return null;
  }
}

/** "Na fila (posição N)" while requested; the status label otherwise. */
export function curationProgressText(curation: CurationView): string {
  if (curation.status === 'requested') {
    return curation.queuePosition === null ? 'Na fila' : `Na fila (posição ${curation.queuePosition})`;
  }
  if (curation.status === 'collecting') return 'O curador está trabalhando';
  return curationStatusLabels[curation.status];
}

/** One short line for the owner's decision on a proposal, or null before any. */
export function curationDecisionText(decision: CurationView['decision']): string | null {
  if (decision === null) return null;
  if (decision.action === 'declined') return 'Recusada por você';
  return decision.comparisonId === null ? 'Salva como rascunho' : 'Salva como rascunho e comparada';
}

/** `<id>@<version>` split; asset and recipe refs share the shape (SPEC 0005 L7). Null when malformed. */
function splitVersionedRef(ref: string): { id: string; version: number } | null {
  const separator = ref.lastIndexOf('@');
  const versionText = ref.slice(separator + 1);
  if (separator <= 0 || !/^[1-9][0-9]{0,8}$/.test(versionText)) return null;
  return { id: ref.slice(0, separator), version: Number.parseInt(versionText, 10) };
}

/** The version page of a curated ref; `kind` decides catalog or recipes, since the ref cannot. */
export function curatedVersionHref(kind: CuratableKind, ref: string): string | null {
  const parsed = splitVersionedRef(ref);
  if (parsed === null) return null;
  const base = kind === 'recipe' ? '/receitas' : '/catalogo';
  return `${base}/${encodeURIComponent(parsed.id)}?versao=${parsed.version}`;
}

/** The asset id of a prompt or skill subject; null for a recipe subject or a malformed ref. */
export function subjectAssetId(subject: CurationSubject): string | null {
  if (subject.kind === 'recipe') return null;
  return splitVersionedRef(subject.ref)?.id ?? null;
}

export function curationHref(curationId: string): string {
  return `/curadorias/${encodeURIComponent(curationId)}`;
}
