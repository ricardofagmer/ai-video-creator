/**
 * What the user agent string says about this computer and browser. Pure functions over the
 * string, so tests pass any agent. Mac user agents report "Intel" on Apple Silicon too, so the
 * page cannot tell the chip apart; the download copy states the Apple Silicon requirement instead.
 */
export type OperatingSystem = 'macos' | 'windows' | 'other';

export function detectOperatingSystem(userAgent: string): OperatingSystem {
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return 'other';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos';
  if (/Windows/i.test(userAgent)) return 'windows';
  return 'other';
}

/**
 * Safari (and every iOS browser, which all run WebKit) blocks an HTTPS page's requests to
 * `http://127.0.0.1` as mixed content (vetting 0006 section 2.4, WebKit bug 171934). Decided by
 * user agent, by design, so Safari is never mistaken for "not installed".
 */
export function isLoopbackBlockedBrowser(userAgent: string): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  const isSafariFamily = /Safari\//.test(userAgent) && /Version\//.test(userAgent);
  const isOtherEngine = /Chrome\/|Chromium\/|Edg\/|OPR\/|Firefox\/|CriOS\/|FxiOS\//.test(userAgent);
  return isSafariFamily && !isOtherEngine;
}
