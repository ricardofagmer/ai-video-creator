import { type AssetVersionView } from '@studio/shared/api';
import { type WebMessages } from '@/messages';

type PurposeTexts = WebMessages['catalog']['purpose'];

/**
 * The short description a hover preview shows: the AI or owner purpose, else the pending note while
 * the AI writes it, else the version's own summary, else the "not yet" text.
 */
export function purposeTextOf(version: AssetVersionView, t: PurposeTexts): string {
  const purpose = version.purpose.trim();
  if (purpose !== '') return purpose;
  const job = version.purposeJob?.status;
  if (job === 'requested' || job === 'running') return t.pending;
  const summary = version.summary.trim();
  return summary === '' ? t.empty : summary;
}
