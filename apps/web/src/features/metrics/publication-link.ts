import { parsePublicationUrl } from '@studio/shared/metrics';

/**
 * The `href` for a stored publication URL, or null when it is not one the allowlist rebuilds. The
 * api stores only canonical `https` URLs; re-parsing here means a corrupt or unexpected value is
 * shown as text and never becomes a link (no `javascript:` or other scheme can reach `href`).
 */
export function publicationHref(storedUrl: string): string | null {
  const parsed = parsePublicationUrl(storedUrl);
  return parsed.status === 'recognized' && parsed.url.startsWith('https://') ? parsed.url : null;
}

/**
 * The id of the R3 "Link do vídeo publicado" input. OD8 sends the owner there from the publish
 * dialog: Instagram is posted in the app and its link pasted here.
 */
export const PUBLICATION_URL_INPUT_ID = 'publicacao-link';
