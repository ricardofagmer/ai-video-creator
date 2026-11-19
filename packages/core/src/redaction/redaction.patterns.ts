/** Replacement texts of RUN-FORMAT.md section 2 and topology section 8. */
export const SECRET_REPLACEMENT = '<redacted>';
export const BIOMETRIC_REPLACEMENT = '<biometric-ref>';

/**
 * A secret shape found by pattern, independent of which keys are loaded. `replacement` keeps
 * the label of a `name: value` pair readable while the value goes. Every pattern is linear: no
 * nested quantifiers, bounded prefixes, so a hostile input cannot make it backtrack for long.
 */
export interface SecretPattern {
  id: string;
  pattern: RegExp;
  replacement: string;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: 'private-key-block',
    pattern: /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?-----END [A-Z ]{0,40}PRIVATE KEY-----/g,
    replacement: SECRET_REPLACEMENT,
  },
  // Anthropic keys: `sk-ant-api03-...`, `sk-ant-admin01-...`.
  { id: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{8,}/g, replacement: SECRET_REPLACEMENT },
  // ElevenLabs keys: `sk_` followed by a long alphanumeric (hex in current keys).
  { id: 'elevenlabs-key', pattern: /\bsk_[A-Za-z0-9]{32,}/g, replacement: SECRET_REPLACEMENT },
  { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replacement: SECRET_REPLACEMENT },
  { id: 'bearer-token', pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: `$1 ${SECRET_REPLACEMENT}` },
  // `user:password@` inside a URL.
  { id: 'url-credentials', pattern: /(\/\/[^\s:/@]{1,256}:)[^\s@/]{1,256}@/g, replacement: `$1${SECRET_REPLACEMENT}@` },
  // `ANTHROPIC_API_KEY=...`, `"x-api-key": "..."`, `xi-api-key: ...`, `password=...` and similar.
  {
    id: 'credential-assignment',
    pattern:
      /\b([A-Za-z0-9_-]{0,64}?(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|password|passphrase|authorization))(["']?\s{0,8}[:=]\s{0,8}["']?)[^\s"',;]{6,}/gi,
    replacement: `$1$2${SECRET_REPLACEMENT}`,
  },
];
