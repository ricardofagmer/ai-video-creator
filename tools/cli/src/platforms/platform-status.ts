import { RunFileError, readRunManifest } from '@studio/shared/run-files';
import { type EgressEntry, type RunId } from '@studio/shared/run-format';
import { cliText } from '../i18n/messages.js';
import { type Printer } from '../output/printer.js';
import { attemptLines, leftTheMachineLines } from './left-the-machine-text.js';
import { type PlatformGateway } from './platform-gateway.js';
import { platformStatusLines } from './platform-text.js';

export interface PlatformStatusOptions {
  gateway: PlatformGateway;
  printer: Printer;
  /** Text of a failure; the command boundary's error report in production. */
  describeError: (error: unknown) => string;
  now: () => Date;
}

/**
 * The `studio status` platform lines (SPEC 0007 section 5.3, AC 43). Status is a read: a platform
 * problem is a warning on stderr, never a failed status.
 */
export async function printPlatformStatus(options: PlatformStatusOptions): Promise<void> {
  try {
    for (const line of platformStatusLines(await options.gateway.list(), options.now())) options.printer.line(line);
  } catch (error) {
    options.printer.error(cliText().platforms.text.notRead(options.describeError(error)));
  }
}

type EgressRead = { status: 'read'; entries: readonly EgressEntry[] } | { status: 'unreadable' };

async function readEgress(runDir: string, runId: RunId): Promise<EgressRead> {
  try {
    const manifest = await readRunManifest(runDir);
    // Not packaged yet: section 5.4 renders `manifest.json.egress`, so there is nothing to list.
    if (manifest.status === 'absent') return { status: 'read', entries: [] };
    return manifest.value.runId === runId ? { status: 'read', entries: manifest.value.egress } : { status: 'unreadable' };
  } catch (error) {
    // Reported as one warning line by the caller; the error's own text may quote a path.
    if (error instanceof RunFileError) return { status: 'unreadable' };
    throw error;
  }
}

export interface LeftTheMachineOptions extends Omit<PlatformStatusOptions, 'now'> {
  runId: RunId;
  runDir: string;
}

/**
 * "O que saiu da máquina" and the run's publish attempts for `studio runs show` (section 5.4,
 * AC 49), after `PublishAttemptSync` for that run. A read: problems are warnings on stderr.
 */
export async function printLeftTheMachine(options: LeftTheMachineOptions): Promise<void> {
  const egress = await readEgress(options.runDir, options.runId);
  if (egress.status === 'unreadable') options.printer.error(cliText().platforms.text.manifestUnreadable);
  try {
    const view = await options.gateway.runPublish(options.runId);
    const entries = egress.status === 'read' ? egress.entries : [];
    for (const line of leftTheMachineLines(entries, view.leftTheMachine)) options.printer.line(line);
    for (const line of attemptLines(view.attempts)) options.printer.line(line);
  } catch (error) {
    options.printer.error(cliText().platforms.text.uploadsNotRead(options.describeError(error)));
  }
}
