import { ExitCode } from '../errors/exit-codes.js';
import { type CommandDependencies } from './command-dependencies.js';
import { withPortalPairing } from './portal-context.js';

/**
 * `studio portal pair` (ticket 07, ADR 0010 decision 7): issues a one-time pair code for the
 * hosted portal. The menu-bar app is the only caller; it reads stdout, opens
 * `<portal origin>/#pair=<CODE>` and discards the rest.
 *
 * stdout contract: exactly one line, `{"code":"<8 chars>","expiresAt":"<ISO 8601 UTC>"}`, and
 * nothing else. The code goes to stdout only: never to a log, a file, stderr or an error message.
 * Failures print nothing on stdout; the boundary in `main` writes one stderr line and the exit code.
 */
export async function portalPairCommand(dependencies: CommandDependencies): Promise<number> {
  const issued = await withPortalPairing((pairing) => pairing.issuePairCode());
  dependencies.printer.line(JSON.stringify({ code: issued.code, expiresAt: issued.expiresAt.toISOString() }));
  return ExitCode.ok;
}

/**
 * `studio portal disconnect`: revokes every portal token, so a paired browser loses status access.
 *
 * stdout contract: exactly one line, `{"revoked":<non-negative integer>}`.
 */
export async function portalDisconnectCommand(dependencies: CommandDependencies): Promise<number> {
  const { revoked } = await withPortalPairing((pairing) => pairing.revokeAllTokens());
  dependencies.printer.line(JSON.stringify({ revoked }));
  return ExitCode.ok;
}
