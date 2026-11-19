import { type AssetVersionView } from '@studio/shared/api';

/** Outcome of a status change or a save, carried in `?aviso=` so the server page renders the Alert. */
export type StatusNotice = 'ativada' | 'descontinuada' | 'licenca' | 'erro' | 'salvo';

const notices: readonly StatusNotice[] = ['ativada', 'descontinuada', 'licenca', 'erro', 'salvo'];

export function statusNoticeFrom(value: string | string[] | undefined): StatusNotice | null {
  return notices.find((notice) => notice === value) ?? null;
}

/** Target of the "Ativar" button's `aria-describedby` (design/telas/03, Acessibilidade). */
export const LICENSE_ALERT_ID = 'alerta-licenca';

/**
 * Mirror of the core catalog policy (`requiresLicenseToActivate`, packages/core catalog-policy.ts):
 * third-party versions and the kinds that are third-party by nature (music, sfx) need license and
 * provenance before `active`. The api enforces it; the web only explains it up front (criterion 7).
 */
export function activationBlockedByLicense(version: AssetVersionView): boolean {
  const requiresLicense = version.sensitivity === 'third-party' || version.kind === 'music' || version.kind === 'sfx';
  return requiresLicense && (version.license === null || version.provenance === null);
}
