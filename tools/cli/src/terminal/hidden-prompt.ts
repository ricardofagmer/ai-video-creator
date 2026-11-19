import { TerminalRequiredError } from '../errors/cli.errors.js';

const ENTER = new Set(['\r', '\n']);
const BACKSPACE = new Set(['\u007f', '\b']);
const CTRL_C = '\u0003';
const CTRL_D = '\u0004';

export interface HiddenPromptOptions {
  /** pt-BR label written to stderr; the typed value is never written anywhere. */
  label: string;
  maxLength: number;
  /** Name used in the "needs a terminal" error. */
  command: string;
}

function abortError(): Error {
  const error = new Error('Prompt cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Reads one line from the terminal with echo off (raw mode, nothing printed per key), so the value
 * never appears on screen, in argv, in shell history or in a log. Ctrl-C and Ctrl-D cancel. Input
 * past `maxLength` keeps being read but is refused by the caller's length check, never cut silently.
 */
export function readHiddenLine(options: HiddenPromptOptions): Promise<string> {
  const input = process.stdin;
  if (input.isTTY !== true) return Promise.reject(new TerminalRequiredError(options.command));
  process.stderr.write(options.label);
  return new Promise<string>((resolve, reject) => {
    let value = '';
    let overflow = false;
    const finish = (outcome: { kind: 'value' } | { kind: 'cancel' }): void => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stderr.write('\n');
      if (outcome.kind === 'cancel') reject(abortError());
      // One character past the limit makes the caller's check refuse it.
      else resolve(overflow ? `${value}x` : value);
    };
    const onData = (chunk: Buffer): void => {
      for (const character of chunk.toString('utf8')) {
        if (character === CTRL_C || character === CTRL_D) return finish({ kind: 'cancel' });
        if (ENTER.has(character)) return finish({ kind: 'value' });
        if (BACKSPACE.has(character)) {
          value = [...value].slice(0, -1).join('');
          continue;
        }
        if (character < ' ') continue;
        if ([...value].length >= options.maxLength) overflow = true;
        else value += character;
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}
