/**
 * Process exit codes of `studio`. Scripts (R1-22 install, doctor in CI-like checks) branch on
 * them, so the numbers are part of the CLI contract.
 */
export const ExitCode = {
  ok: 0,
  internal: 1,
  /** Bad arguments or input that failed boundary validation. */
  usage: 2,
  notFound: 3,
  /** The action conflicts with current state (watcher owns the run, already running, ...). */
  conflict: 4,
  /** A dependency is unavailable: database, Keychain, built api/web, a port. */
  dependency: 5,
  /** `doctor` found at least one unhealthy check. */
  unhealthy: 6,
  /** The command finished, but some entries failed (`catalog seed`). */
  partial: 7,
  /** Ctrl-C. */
  interrupted: 130,
} satisfies Record<string, number>;

/** Error taxonomy categories of the core error families (rules/observability.md). */
export type ErrorCategory = 'validation' | 'not_found' | 'conflict' | 'dependency' | 'internal';

export function exitCodeForCategory(category: ErrorCategory): number {
  switch (category) {
    case 'validation':
      return ExitCode.usage;
    case 'not_found':
      return ExitCode.notFound;
    case 'conflict':
      return ExitCode.conflict;
    case 'dependency':
      return ExitCode.dependency;
    case 'internal':
      return ExitCode.internal;
  }
}
