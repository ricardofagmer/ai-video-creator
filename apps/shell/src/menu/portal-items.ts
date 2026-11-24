import { type PortalLinkReport, type PortalLinkStatus, type PortalMenuState, type UpdateStatus } from '../portal/portal-state';
import { type ServiceStatus } from '../state/state-model';
import { type ShellLabels } from './labels';
import { type MenuItemModel } from './menu-model';

function reportLine(report: PortalLinkReport, labels: ShellLabels): string {
  if (report.action === 'connect') return report.outcome === 'opened' ? labels.portalOpened : labels.portalConnectFailed;
  return report.outcome === 'revoked' ? labels.portalDisconnected(report.revoked) : labels.portalDisconnectFailed;
}

/** Progress while a CLI call runs, the last result after it ends; nothing before the first click. */
function linkLine(link: PortalLinkStatus, labels: ShellLabels): string | null {
  if (link.phase === 'running') return link.action === 'connect' ? labels.portalConnecting : labels.portalDisconnecting;
  return link.last === null ? null : reportLine(link.last, labels);
}

/**
 * "Connect to portal": only with a configured origin, while the api runs (the portal redeems the
 * code through it within 5 minutes) and no portal call is in flight.
 */
export function isConnectPortalEnabled(portal: PortalMenuState, api: ServiceStatus): boolean {
  return portal.availability === 'configured' && api === 'running' && portal.link.phase === 'idle';
}

/** "Disconnect portal": revoking needs only the database, so the api may be stopped. */
export function isDisconnectPortalEnabled(portal: PortalMenuState): boolean {
  return portal.link.phase === 'idle';
}

/** The update line appears only when `latest.json` names a newer version (DI-AC-17). */
function updateItems(update: UpdateStatus, labels: ShellLabels): MenuItemModel[] {
  return update.kind === 'available' ? [{ kind: 'action', id: 'open-update', label: labels.updateAvailable(update.version), enabled: true }] : [];
}

/** The portal section; an unset or invalid origin shows one disabled, explanatory line instead of "Connect". */
export function portalItems(portal: PortalMenuState, api: ServiceStatus, labels: ShellLabels): MenuItemModel[] {
  const connect: MenuItemModel =
    portal.availability === 'configured'
      ? { kind: 'action', id: 'connect-portal', label: labels.connectPortal, enabled: isConnectPortalEnabled(portal, api) }
      : { kind: 'info', label: labels.portalNotConfigured };
  const items: MenuItemModel[] = [connect, { kind: 'action', id: 'disconnect-portal', label: labels.disconnectPortal, enabled: isDisconnectPortalEnabled(portal) }];
  const line = linkLine(portal.link, labels);
  if (line !== null) items.push({ kind: 'info', label: line });
  return [...items, ...updateItems(portal.update, labels)];
}

/** Packaged app only: the setup window and the uninstall flow of `PackagedShell`. */
export function packagedItems(labels: ShellLabels): MenuItemModel[] {
  return [
    { kind: 'action', id: 'setup', label: labels.setupRepair, enabled: true },
    { kind: 'action', id: 'uninstall', label: labels.uninstall, enabled: true },
  ];
}
