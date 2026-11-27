import { type ProcessRunner } from '../setup/process-runner';
import { openHttpsExternal, type OpenExternal } from './external-url';
import { pairLink, parseDisconnectOutput, parsePairOutput } from './pair-link';
import { PORTAL_DISCONNECT_ARGS, PORTAL_PAIR_ARGS, type PortalCliRequest } from './portal-cli';
import { type HttpsSetting } from './portal-settings';
import { type PortalAction, type PortalLinkReport, type PortalLinkStatus } from './portal-state';

/** Exit code 0 of `tools/cli/src/errors/exit-codes.ts`. */
const CLI_EXIT_OK = 0;

export interface PortalLinkOptions {
  readonly portalOrigin: HttpsSetting;
  readonly run: ProcessRunner;
  readonly cliRequest: PortalCliRequest;
  readonly now: () => number;
  readonly openExternal: OpenExternal;
  readonly onChange: () => void;
}

/**
 * "Connect to portal" and "Disconnect portal" (ADR 0010 decision 7). Connect asks the CLI for a
 * one-time code and opens `<origin>/#pair=<CODE>` in the system browser; the code stays in this
 * function's memory and the URL fragment, never in a log, a file, the menu or a diagnostic.
 * Disconnect revokes every portal token. Both run only on a menu click.
 */
export class PortalLink {
  private state: PortalLinkStatus = { phase: 'idle', last: null };

  constructor(private readonly options: PortalLinkOptions) {}

  status(): PortalLinkStatus {
    return this.state;
  }

  connect(): Promise<void> {
    return this.runOnce('connect', () => this.issueAndOpen());
  }

  disconnect(): Promise<void> {
    return this.runOnce('disconnect', () => this.revoke());
  }

  private async runOnce(action: PortalAction, work: () => Promise<PortalLinkReport>): Promise<void> {
    if (this.state.phase !== 'idle') return;
    this.setState({ phase: 'running', action });
    let report: PortalLinkReport;
    try {
      report = await work();
    } catch {
      report = { action, outcome: 'failed' };
    }
    this.setState({ phase: 'idle', last: report });
  }

  private async issueAndOpen(): Promise<PortalLinkReport> {
    const { portalOrigin, run, cliRequest, now, openExternal } = this.options;
    const failed: PortalLinkReport = { action: 'connect', outcome: 'failed' };
    // Refused before the CLI runs: no code is issued for an address that cannot be opened.
    if (portalOrigin.kind !== 'configured') return failed;
    const result = await run(cliRequest(PORTAL_PAIR_ARGS));
    if (result.kind !== 'exited' || result.code !== CLI_EXIT_OK) return failed;
    const issued = parsePairOutput(result.stdout, now());
    if (issued === null) return failed;
    const opened = await openHttpsExternal(pairLink(portalOrigin.url, issued.code), openExternal);
    return opened ? { action: 'connect', outcome: 'opened' } : failed;
  }

  private async revoke(): Promise<PortalLinkReport> {
    const failed: PortalLinkReport = { action: 'disconnect', outcome: 'failed' };
    const result = await this.options.run(this.options.cliRequest(PORTAL_DISCONNECT_ARGS));
    if (result.kind !== 'exited' || result.code !== CLI_EXIT_OK) return failed;
    const revoked = parseDisconnectOutput(result.stdout);
    return revoked === null ? failed : { action: 'disconnect', outcome: 'revoked', revoked };
  }

  private setState(state: PortalLinkStatus): void {
    this.state = state;
    this.options.onChange();
  }
}
