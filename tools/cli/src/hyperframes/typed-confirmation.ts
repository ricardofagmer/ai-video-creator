import { type TerminalPort } from '../terminal/line-prompt.js';
import { HyperframesConfirmationError } from './hyperframes.errors.js';

/**
 * One typed answer on the owner's terminal; anything but the exact text refuses. The commands that
 * use it take no option, so no flag can supply the confirmation (AC 69).
 */
export async function askTypedConfirmation(terminal: TerminalPort, signal: AbortSignal, options: { label: string; expected: string }): Promise<void> {
  const prompter = terminal.open(signal);
  let answer: string;
  try {
    answer = await prompter.ask(options.label);
  } finally {
    prompter.close();
  }
  if (answer.trim() !== options.expected) throw new HyperframesConfirmationError();
}
