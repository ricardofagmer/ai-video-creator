/** Statuses on which ElevenLabs names why it refused (`quota_exceeded`, `invalid_api_key`, ...). */
const REFUSAL_STATUSES: ReadonlySet<number> = new Set([401, 403]);
/** The refusal JSON is a few hundred bytes; anything larger is not a refusal body. */
const MAX_REFUSAL_BYTES = 4096;
/** Only a short snake_case code leaves this module, never free text from the body. */
const REFUSAL_CODE = /^[a-z_]{1,40}$/;

/**
 * Reads ElevenLabs' refusal code (`detail.status`) from a 401/403 response, so a spent quota is not
 * reported as a bad key. Reads at most 4 KB; the body itself is never logged, stored or returned.
 * Any other status, a larger or malformed body, or a code of another shape yields null. The body
 * is always consumed or cancelled.
 */
export async function elevenLabsRefusalCode(response: Response): Promise<string | null> {
  if (!REFUSAL_STATUSES.has(response.status)) {
    await response.body?.cancel();
    return null;
  }
  const text = await boundedText(response);
  if (text === null) return null;
  return refusalCodeOf(text);
}

async function boundedText(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (reader === undefined) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REFUSAL_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function refusalCodeOf(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (typeof parsed !== 'object' || parsed === null || !('detail' in parsed)) return null;
  const { detail } = parsed;
  if (typeof detail !== 'object' || detail === null || !('status' in detail) || typeof detail.status !== 'string') return null;
  return REFUSAL_CODE.test(detail.status) ? detail.status : null;
}
