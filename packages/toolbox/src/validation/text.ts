/** Words as the narration counts them: whitespace-separated tokens. */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word.length > 0);
}

export function countWords(text: string): number {
  return splitWords(text).length;
}

export function normalizeWhitespace(text: string): string {
  return splitWords(text).join(' ');
}

/** Normalised href for comparing source URLs; malformed input compares as-is. */
export function normalizeUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}
