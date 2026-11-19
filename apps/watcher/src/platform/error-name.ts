/**
 * The error's class name for a log field. Messages are left out on purpose: they can quote paths,
 * packet text or provider output (K7), and a name is enough to tell failures apart.
 */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'NonErrorThrown';
}
