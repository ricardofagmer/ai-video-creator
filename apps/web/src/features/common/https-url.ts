/**
 * Owner-typed links (image links, site links, the checkout site) are untrusted input: only an absolute
 * `https:` URL with a host and no credentials passes; anything else returns null.
 */
export function httpsUrlFrom(text: string, maxLength: number): URL | null {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > maxLength || !URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '' ? url : null;
}
