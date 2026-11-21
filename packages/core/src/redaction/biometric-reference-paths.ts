import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * A registered biometric reference: the path as typed at registration (SQLite) and the path it
 * resolves to now. Resolution follows symlinks on the registered path itself only; nothing under
 * it is opened, listed or hashed.
 */
export type BiometricReferencePath =
  | { status: 'resolved'; typed: string; real: string }
  | { status: 'missing'; typed: string }
  | { status: 'unreadable'; typed: string };

function errorCodeOf(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

export async function resolveBiometricReferencePath(typed: string): Promise<BiometricReferencePath> {
  try {
    return { status: 'resolved', typed, real: await realpath(typed) };
  } catch (error) {
    const code = errorCodeOf(error);
    // The raw error names the path; only its kind is kept.
    return code === 'ENOENT' || code === 'ENOTDIR' ? { status: 'missing', typed } : { status: 'unreadable', typed };
  }
}

export function resolveBiometricReferencePaths(typedPaths: readonly string[]): Promise<BiometricReferencePath[]> {
  return Promise.all(typedPaths.map(resolveBiometricReferencePath));
}

/** Every spelling a reference is known by: the typed path, its lexical resolution and its realpath. */
export function referenceSpellings(reference: BiometricReferencePath): string[] {
  const spellings = new Set<string>([reference.typed, resolve(reference.typed)]);
  if (reference.status === 'resolved') spellings.add(reference.real);
  return [...spellings];
}

/**
 * The typed paths plus the realpath of each, for the redaction pattern: a path written through a
 * symlink, or through the canonical location of a symlinked registration, is still redacted. A
 * reference that cannot be resolved keeps its typed spelling (an unplugged drive must not stop
 * every redaction).
 */
export async function withRealPathSpellings(typedPaths: readonly string[]): Promise<string[]> {
  const references = await resolveBiometricReferencePaths(typedPaths);
  return [...new Set(references.flatMap(referenceSpellings))];
}
