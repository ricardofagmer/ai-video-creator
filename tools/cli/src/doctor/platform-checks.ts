import { type PublishSyncSummary } from '@studio/core/platforms';
import { type PlatformView, type PlatformsView } from '@studio/shared/api';
import { type CapabilityStatus } from '@studio/shared/platforms';
import { PLATFORM_LABELS, RECONNECT_REASON_TEXTS } from '../platforms/platform-labels.js';
import { backoffText, capabilityStatusText, platformHeading } from '../platforms/platform-text.js';
import { type DoctorCheck } from './doctor-check.js';

/*
 * The platform lines of `studio doctor` (SPEC 0007 section 5.9): one per platform with the same
 * status words as the web, and one for the publish attempts after `PublishAttemptSync`. A platform
 * that needs the owner (reconnect, missing app credentials, a backoff in force) is a warning, never
 * a failure: the CSV and form import keep working (OD2). Ids, states, reason ids and counts only.
 */

function anyStatus(view: PlatformView, status: CapabilityStatus): boolean {
  return view.status.metrics === status || view.status.publish === status;
}

function platformProblems(view: PlatformView, now: Date): string[] {
  const problems: string[] = [];
  if (anyStatus(view, 'needs-reconnect')) {
    const reason = view.reconnectReason === null ? '' : ` ${RECONNECT_REASON_TEXTS[view.reconnectReason]}`;
    problems.push(`reconecte a conta na página Contas do web.${reason}`);
  }
  if (anyStatus(view, 'not-configured')) problems.push('aplicativo não configurado: rode "studio secrets set" com as credenciais do aplicativo');
  const backoff = backoffText(view, now);
  if (backoff !== null) problems.push(backoff);
  return problems;
}

/** One check per platform, in `PlatformSchema` order. */
export function platformChecks(views: PlatformsView, now: Date): DoctorCheck[] {
  return views.platforms.map((view): DoctorCheck => {
    const label = `plataforma ${PLATFORM_LABELS[view.platform]}`;
    const tracked = `${view.trackedPublications} publicação(ões) acompanhada(s)`;
    const detail = `${platformHeading(view)}; ${capabilityStatusText(view)}; ${tracked}`;
    const problems = platformProblems(view, now);
    if (problems.length === 0) return { label, status: 'ok', detail };
    return { label, status: 'warning', detail: `${detail}; ${problems.join('; ')}` };
  });
}

/** Section 5.4 "Result": what one sync pass found; expiring a request is normal, never a warning. */
export function publishAttemptCheck(summary: PublishSyncSummary): DoctorCheck {
  return {
    label: 'envios às plataformas',
    status: 'ok',
    detail: `${summary.open} em aberto, ${summary.updated} atualizado(s), ${summary.expired} vencido(s) agora, ${summary.linked} ligado(s) a publicações.`,
  };
}
