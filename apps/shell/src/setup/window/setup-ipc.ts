import { type ShellLocale } from '../../i18n/locale';
import { type ConsentAnswer, type DownloadOffer, type SetupProgress } from '../setup-types';

/*
 * The whole IPC surface of the setup window: one channel each way. The page itself runs no script;
 * the sandboxed, context-isolated preload renders the view and sends answers, and exposes nothing to
 * the page (no contextBridge API). Main validates every incoming message and its sender, so a
 * compromised renderer can at most answer the question it was asked.
 */

/** main -> preload: the full view to show. */
export const SETUP_VIEW_CHANNEL = 'setup:view';
/** preload -> main: one answer or action. */
export const SETUP_MESSAGE_CHANNEL = 'setup:message';

/** Same bounds as the CLI's passphrase hasher (`MIN_PASSPHRASE_LENGTH`, `MAX_PASSPHRASE_LENGTH`). */
export const MIN_PASSPHRASE_CHARS = 8;
export const MAX_PASSPHRASE_CHARS = 1024;
/** UTF-8 worst case of the maximum, so main can refuse anything larger before it is copied. */
export const MAX_PASSPHRASE_BYTES = MAX_PASSPHRASE_CHARS * 4;

export type SetupPrompt =
  | { readonly kind: 'none' }
  | { readonly kind: 'passphrase'; readonly requestId: number }
  | { readonly kind: 'consent'; readonly requestId: number; readonly offer: DownloadOffer };

export interface SetupWindowView {
  readonly locale: ShellLocale;
  /** Null before the first run reported anything. */
  readonly progress: SetupProgress | null;
  readonly prompt: SetupPrompt;
}

export type SetupWindowMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'passphrase'; readonly requestId: number; readonly secret: Uint8Array }
  | { readonly kind: 'passphrase-cancelled'; readonly requestId: number }
  | { readonly kind: 'consent'; readonly requestId: number; readonly answer: ConsentAnswer }
  | { readonly kind: 'retry' }
  | { readonly kind: 'close' };

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestIdOf(value: Record<string, unknown>): number | null {
  const id = value['requestId'];
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function consentAnswerOf(value: unknown): ConsentAnswer | null {
  return value === 'accepted' || value === 'declined' ? value : null;
}

function requestMessage(value: Record<string, unknown>, kind: string): SetupWindowMessage | null {
  const requestId = requestIdOf(value);
  if (requestId === null) return null;
  if (kind === 'passphrase-cancelled') return { kind, requestId };
  if (kind === 'consent') {
    const answer = consentAnswerOf(value['answer']);
    return answer === null ? null : { kind, requestId, answer };
  }
  const secret = value['secret'];
  if (!(secret instanceof Uint8Array) || secret.byteLength === 0 || secret.byteLength > MAX_PASSPHRASE_BYTES) return null;
  return { kind: 'passphrase', requestId, secret };
}

/** Main's allowlist parse of a renderer message; anything else is null and ignored. */
export function parseSetupWindowMessage(value: unknown): SetupWindowMessage | null {
  if (!isRecordObject(value)) return null;
  const kind = value['kind'];
  if (kind === 'ready' || kind === 'retry' || kind === 'close') return { kind };
  if (kind === 'passphrase' || kind === 'passphrase-cancelled' || kind === 'consent') return requestMessage(value, kind);
  return null;
}
