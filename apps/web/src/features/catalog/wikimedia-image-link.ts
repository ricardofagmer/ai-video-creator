/**
 * Wikipedia and Wikimedia Commons show an image on a page of its own: the media viewer
 * (`…/wiki/Lego#/media/Ficheiro:LEGO_logo.svg`) or the file page (`…/wiki/File:LEGO_logo.svg`). Both links
 * answer HTML, so an `<img>` cannot draw them. Every wiki also serves `Special:FilePath/<name>`, which
 * redirects to the file itself; that name works in every language. The rewrite happens in the browser:
 * nothing is fetched here.
 */

const WIKIMEDIA_HOST = /^(?:[a-z0-9-]+\.(?:m\.)?wikipedia\.org|commons\.(?:m\.)?wikimedia\.org)$/;
const MEDIA_VIEWER_PREFIX = '#/media/';
const WIKI_PATH_PREFIX = '/wiki/';
/** The file namespace is named per language (File, Ficheiro, Archivo…), so the page is told by its image name. */
const IMAGE_FILE_NAME = /\.(?:svg|png|jpe?g|gif|webp|avif|bmp|tiff?)$/i;
const FILE_NAME_MAX = 240;

function decoded(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/** `Ficheiro:LEGO_logo.svg` gives `LEGO_logo.svg`; null when there is no namespace or no image name. */
function fileNameOf(title: string): string | null {
  const separator = title.indexOf(':');
  if (separator <= 0) return null;
  const name = title.slice(separator + 1).trim();
  if (name === '' || name.length > FILE_NAME_MAX || name.includes('/') || !IMAGE_FILE_NAME.test(name)) return null;
  return name;
}

function pageTitleOf(url: URL): string | null {
  if (url.hash.startsWith(MEDIA_VIEWER_PREFIX)) return decoded(url.hash.slice(MEDIA_VIEWER_PREFIX.length));
  if (url.pathname.startsWith(WIKI_PATH_PREFIX)) return decoded(url.pathname.slice(WIKI_PATH_PREFIX.length));
  return null;
}

/**
 * The address of the image file behind a Wikipedia or Wikimedia Commons image page, on the same wiki;
 * null for any other link, which is then used as typed.
 */
export function wikimediaFileUrlOf(url: URL): URL | null {
  if (!WIKIMEDIA_HOST.test(url.hostname)) return null;
  const title = pageTitleOf(url);
  if (title === null || title.startsWith('Special:FilePath/')) return null;
  const name = fileNameOf(title);
  if (name === null) return null;
  return new URL(`https://${url.hostname}/wiki/Special:FilePath/${encodeURIComponent(name.replaceAll(' ', '_'))}`);
}
