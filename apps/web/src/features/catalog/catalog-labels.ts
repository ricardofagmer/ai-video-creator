import { type AssetKind, type AssetStatus, type LicenseUse, type Sensitivity } from '@studio/shared/catalog';

/** design/telas/02, "Tipos de ativo (PRD 5.1)". */
export const assetKindLabels: Readonly<Record<AssetKind, string>> = {
  template: 'Template',
  'ai-model': 'Modelo de IA',
  reference: 'Referência',
  prompt: 'Prompt',
  skill: 'Skill',
  image: 'Imagem',
  music: 'Música',
  sfx: 'Efeito sonoro',
  'brand-kit': 'Kit de marca',
};

/** design/telas/02, status filter. */
export const assetStatusLabels: Readonly<Record<AssetStatus, string>> = {
  draft: 'Rascunho',
  active: 'Ativo',
  deprecated: 'Descontinuado',
};

/** design/telas/04, Sensibilidade. */
export const sensitivityLabels: Readonly<Record<Sensitivity, string>> = {
  normal: 'Normal',
  biometric: 'Biométrico',
  'third-party': 'Terceiros',
};

/** C1 `LicenseUse` (PRD 5.2 "allowed uses"). */
export const licenseUseLabels: Readonly<Record<LicenseUse, string>> = {
  commercial: 'Comercial',
  'non-commercial': 'Não comercial',
  'social-media': 'Redes sociais',
  modification: 'Modificação',
  'attribution-required': 'Exige atribuição',
  'internal-only': 'Só uso interno',
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** `18/11/2026` from an ISO instant or date. */
export function formatDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

/** `18/11/2026 14:32` from an ISO instant. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormatter.format(date);
}

/** "1 execução" / "N execuções" (design/telas/03, Uso). */
export function usageLabel(usageCount: number): string {
  return usageCount === 1 ? '1 execução' : `${usageCount} execuções`;
}
