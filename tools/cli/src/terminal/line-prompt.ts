import { createInterface } from 'node:readline/promises';
import { TerminalRequiredError } from '../errors/cli.errors.js';

/** One visible question at a time; the answer is returned as typed, without the line break. */
export interface LinePrompter {
  ask(label: string): Promise<string>;
  close(): void;
}

/** The owner's terminal, or the reason there is none; injected so commands stay testable. */
export interface TerminalPort {
  isInteractive(): boolean;
  open(signal: AbortSignal): LinePrompter;
}

function abortError(): Error {
  const error = new Error('Prompt cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Reads lines from the terminal with echo on (the text typed is the owner's own title, caption and
 * tags, never a secret). Questions go to stderr so stdout keeps the command's result. Ctrl-C,
 * Ctrl-D and the command's abort signal cancel the pending question with an `AbortError`, which the
 * command boundary reports as "Interrompido.".
 */
function openTerminalPrompter(signal: AbortSignal): LinePrompter {
  const cancel = new AbortController();
  const combined = AbortSignal.any([signal, cancel.signal]);
  const reader = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  reader.on('SIGINT', () => cancel.abort());
  reader.on('close', () => cancel.abort());
  return {
    ask: async (label) => {
      if (combined.aborted) throw abortError();
      try {
        return await reader.question(label, { signal: combined });
      } catch (error) {
        if (combined.aborted) throw abortError();
        throw error;
      }
    },
    close: () => reader.close(),
  };
}

/** The process's own terminal: interactive only when stdin is a TTY (a pipe or a file never is). */
export const processTerminal: TerminalPort = {
  isInteractive: () => process.stdin.isTTY === true,
  open: (signal) => {
    if (process.stdin.isTTY !== true) throw new TerminalRequiredError('runs publish');
    return openTerminalPrompter(signal);
  },
};
