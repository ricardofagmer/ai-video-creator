import { type StartTimer } from '../actions/studio-invoker';
import { availableUpdate, parseReleaseManifest } from './release-manifest';
import { type HttpsSetting } from './portal-settings';
import { type UpdateStatus } from './portal-state';

/** A plain GET; global `fetch` in production, a stub in tests. */
export type ManifestFetch = (url: string, init: RequestInit) => Promise<Response>;

/** `latest.json` is a few hundred bytes; a larger body is refused while it is read. */
export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MANIFEST_TIMEOUT_MS = 10_000;
/** Opening the menu twice in a row asks the release host once. */
export const MANIFEST_REUSE_MS = 15 * 60_000;

export interface UpdateCheckerOptions {
  readonly manifest: HttpsSetting;
  /** `app.getVersion()`. */
  readonly installedVersion: string;
  readonly fetch: ManifestFetch;
  readonly now: () => number;
  readonly startTimer: StartTimer;
  readonly onChange: () => void;
}

async function readBounded(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (response.body === null) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reads `latest.json` only when asked, and it is asked only when the owner opens the menu: no timer
 * here ever starts a request (ticket 07, "no network request without a user action"). The request
 * carries no query, body, cookie or referrer, so nothing about this computer reaches the release host.
 */
export class UpdateChecker {
  private state: UpdateStatus;
  private downloadUrl: string | null = null;
  private checkedAtMs: number | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly options: UpdateCheckerOptions) {
    this.state = options.manifest.kind === 'configured' ? { kind: 'not-checked' } : { kind: 'not-configured' };
  }

  status(): UpdateStatus {
    return this.state;
  }

  /** The https download of the newer version, while the update line is shown. */
  availableDownload(): string | null {
    return this.state.kind === 'available' ? this.downloadUrl : null;
  }

  /** Called from the menu's open event. Joins a running check and reuses a recent answer. */
  check(): Promise<void> {
    const { manifest, now } = this.options;
    if (manifest.kind !== 'configured') return Promise.resolve();
    if (this.inFlight !== null) return this.inFlight;
    if (this.checkedAtMs !== null && now() - this.checkedAtMs < MANIFEST_REUSE_MS) return Promise.resolve();
    const run = this.fetchManifest(manifest.url).finally(() => {
      this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  private async fetchManifest(url: string): Promise<void> {
    // A shown update line stays while the next answer is fetched.
    if (this.state.kind !== 'available') this.setState({ kind: 'checking' });
    const controller = new AbortController();
    const cancelTimer = this.options.startTimer(MANIFEST_TIMEOUT_MS, () => controller.abort());
    try {
      const response = await this.options.fetch(url, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        // A redirect could leave https; the configured address is the file itself.
        redirect: 'error',
        signal: controller.signal,
      });
      const text = response.ok ? await readBounded(response, MAX_MANIFEST_BYTES) : null;
      this.settle(text);
    } catch {
      this.settle(null);
    } finally {
      cancelTimer();
    }
  }

  private settle(text: string | null): void {
    let body: unknown = null;
    try {
      body = text === null ? null : JSON.parse(text);
    } catch {
      body = null;
    }
    const manifest = parseReleaseManifest(body);
    if (manifest === null) {
      this.downloadUrl = null;
      this.setState({ kind: 'failed' });
      return;
    }
    // Only a valid answer is reused; after a failure the next menu opening asks again.
    this.checkedAtMs = this.options.now();
    const update = availableUpdate(manifest, this.options.installedVersion);
    this.downloadUrl = update?.downloadUrl ?? null;
    this.setState(update === null ? { kind: 'current' } : { kind: 'available', version: update.version });
  }

  private setState(state: UpdateStatus): void {
    this.state = state;
    this.options.onChange();
  }
}
