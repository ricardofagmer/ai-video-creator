import { type StartTimer } from '../actions/studio-invoker';
import { type ProcessRunner } from '../setup/process-runner';
import { openHttpsExternal, type OpenExternal } from './external-url';
import { type PortalCliRequest } from './portal-cli';
import { PortalLink } from './portal-link';
import { type PortalSettings } from './portal-settings';
import { type PortalMenuState } from './portal-state';
import { UpdateChecker, type ManifestFetch } from './update-checker';

export interface PortalServiceOptions {
  readonly settings: PortalSettings;
  readonly installedVersion: string;
  readonly run: ProcessRunner;
  readonly cliRequest: PortalCliRequest;
  readonly fetch: ManifestFetch;
  readonly now: () => number;
  readonly startTimer: StartTimer;
  readonly openExternal: OpenExternal;
  /** Re-renders the menu; called on every state change of either part. */
  readonly onChange: () => void;
}

/** The menu's portal entries behind one object: pairing, revoking and the update line. */
export class PortalService {
  private readonly link: PortalLink;
  private readonly updates: UpdateChecker;

  constructor(private readonly options: PortalServiceOptions) {
    const { settings, onChange } = options;
    this.link = new PortalLink({ ...options, portalOrigin: settings.portalOrigin, onChange });
    this.updates = new UpdateChecker({ ...options, manifest: settings.releaseManifest, onChange });
  }

  menuState(): PortalMenuState {
    return {
      availability: this.options.settings.portalOrigin.kind === 'configured' ? 'configured' : 'not-configured',
      link: this.link.status(),
      update: this.updates.status(),
    };
  }

  connect(): Promise<void> {
    return this.link.connect();
  }

  disconnect(): Promise<void> {
    return this.link.disconnect();
  }

  /** The menu's open event: the only trigger of the manifest request. */
  checkForUpdate(): Promise<void> {
    return this.updates.check();
  }

  /** "Update available": opens the https download named by `latest.json`; nothing when none is shown. */
  async openUpdate(): Promise<boolean> {
    const url = this.updates.availableDownload();
    return url === null ? false : openHttpsExternal(url, this.options.openExternal);
  }
}
