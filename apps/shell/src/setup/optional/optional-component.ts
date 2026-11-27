import { type DownloadOffer, type OptionalComponentId } from '../setup-types';

/*
 * An optional download of plan section 5 step 5 (install.sh steps 7 and 9). Each one says where it
 * would come from and how big it is before anything is fetched; nothing is downloaded without the
 * user's explicit yes, and a refusal or a failure leaves setup complete (DI-AC-04).
 */

export type ComponentPresence =
  | { readonly kind: 'installed' }
  | { readonly kind: 'absent'; readonly offer: DownloadOffer }
  /** No pinned source in this build (provisional manifest, no offer file): nothing can be offered. */
  | { readonly kind: 'unavailable' };

export interface OptionalComponent {
  readonly id: OptionalComponentId;
  presence(): Promise<ComponentPresence>;
  /** Runs the download; true when the component is installed afterwards. */
  install(): Promise<boolean>;
}

const MAX_HOST_CHARS = 253;
const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** The host name of an `https://` URL, or null; the window shows the host only, never a path. */
export function httpsHostOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  return isHostName(url.hostname) ? url.hostname : null;
}

export function isHostName(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length <= MAX_HOST_CHARS && HOST_NAME.test(raw);
}

export function isPositiveSize(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0;
}

export function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
