import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { type Readable } from 'node:stream';
import { locateNodeBinary } from '@studio/core/runtime';
import { type Printer } from '../output/printer.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { embeddingFetchScriptFile, modelResourceRoot } from './model-manifest.js';

/** Absolute path: never resolved through PATH, so a planted binary is not run. */
const BASH_PATH = '/bin/bash';

/**
 * The fetch script's documented exit codes (`scripts/models/fetch-embedding-model.sh` header):
 * 0 verified in place; 1 a folder, download or hash check failed; 2 the committed pins are still
 * placeholders; 3 the manifest or source file is invalid, or `@studio/shared` is not built.
 * `not-started` means bash itself could not be run.
 */
export type ModelFetchOutcome =
  | { readonly status: 'installed' }
  | { readonly status: 'download-failed' }
  | { readonly status: 'unpinned' }
  | { readonly status: 'invalid-source' }
  | { readonly status: 'not-started' }
  | { readonly status: 'other'; readonly exitCode: number | null };

function outcomeOf(exitCode: number | null): ModelFetchOutcome {
  switch (exitCode) {
    case 0:
      return { status: 'installed' };
    case 1:
      return { status: 'download-failed' };
    case 2:
      return { status: 'unpinned' };
    case 3:
      return { status: 'invalid-source' };
    default:
      return { status: 'other', exitCode };
  }
}

function forwardLines(stream: Readable, write: (line: string) => void): void {
  createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY }).on('line', write);
}

/**
 * `studio models fetch`: runs the installer's step 7 script (SPEC 0003 section 5.2, B7, Q6) with a
 * fixed argument array and no shell, so the data-home path is one argument and never parsed as
 * shell text. The child receives the CLI's allowlisted environment (PATH, HOME, ...), never
 * `process.env` wholesale and never a provider key. This is the CLI's only network use: the script
 * sends a plain HTTPS GET per pinned file and no catalog data, query or vector exists in it.
 * Its progress lines (pt-BR, written by the shell script) are forwarded to the printer as they
 * arrive; nothing is logged.
 * A non-zero exit is an outcome for the caller to report, never an error (B7). Ctrl-C kills the
 * child (the script deletes its temporary file) and rejects with the `AbortError`.
 */
export function runModelFetch(settings: CliSettings, printer: Printer, signal: AbortSignal): Promise<ModelFetchOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      BASH_PATH,
      [embeddingFetchScriptFile(settings), '--data-home', settings.dataHome.root, '--node', locateNodeBinary(settings.runtime, process.execPath)],
      {
        cwd: modelResourceRoot(settings),
        env: { ...settings.childEnvironment },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        signal,
      },
    );
    let settled = false;
    forwardLines(child.stdout, (line) => printer.line(line));
    forwardLines(child.stderr, (line) => printer.error(line));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (signal.aborted) {
        reject(error);
        return;
      }
      resolve({ status: 'not-started' });
    });
    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      resolve(outcomeOf(exitCode));
    });
  });
}
