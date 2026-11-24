import { CLI_EXIT, runCli, type SetupContext } from '../setup-context';
import { type SetupStep, type StepRunResult } from '../setup-types';

/**
 * `studio passphrase set --stdin`: reads the passphrase and its repetition as two lines from stdin
 * instead of a terminal. The CLI only hashes it (argon2id) and stores the PHC string.
 */
export const PASSPHRASE_SET_ARGS: readonly string[] = ['passphrase', 'set', '--stdin'];
const PASSPHRASE_STATUS_ARGS: readonly string[] = ['passphrase', 'status'];
/** `ExitCode.usage`: the CLI refused the value (too short, too long). */
const CLI_EXIT_USAGE = 2;

const NEWLINE = Buffer.from('\n', 'utf8');

/**
 * Both lines the CLI expects, in one buffer. The window already checked that the two entries match,
 * so the same secret is written twice; the caller's buffer is wiped here and the combined one by the
 * process runner after the write.
 */
function stdinPayload(secret: Buffer): Buffer {
  const payload = Buffer.concat([secret, NEWLINE, secret, NEWLINE]);
  secret.fill(0);
  return payload;
}

/**
 * Step 4. The passphrase is typed in the setup window and reaches the CLI over stdin only: never in
 * argv, the environment, a log or a file. An existing hash is never replaced by setup, so a second
 * run or an upgrade keeps it (DI-AC-02, DI-AC-05).
 */
export function passphraseStep(context: SetupContext): SetupStep {
  return {
    id: 'passphrase',
    required: true,
    async check() {
      return (await runCli(context, PASSPHRASE_STATUS_ARGS)) === CLI_EXIT.ok ? { kind: 'done' } : { kind: 'needed' };
    },
    async run(): Promise<StepRunResult> {
      // Asked again right before writing: an unreadable status (a busy database) must never lead
      // to replacing a passphrase that exists.
      const status = await runCli(context, PASSPHRASE_STATUS_ARGS);
      if (status === CLI_EXIT.ok) return { kind: 'done' };
      if (status !== CLI_EXIT.notFound) return { kind: 'failed', reason: 'process-failed' };
      const answer = await context.interaction.requestPassphrase();
      if (answer.kind === 'cancelled') return { kind: 'failed', reason: 'passphrase-cancelled' };
      const exit = await runCli(context, PASSPHRASE_SET_ARGS, { stdin: stdinPayload(answer.secret) });
      if (exit === CLI_EXIT.ok) return { kind: 'done' };
      return { kind: 'failed', reason: exit === CLI_EXIT_USAGE ? 'passphrase-refused' : 'process-failed' };
    },
  };
}
