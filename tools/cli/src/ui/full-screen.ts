/** xterm alternate screen: the dashboard draws on its own screen and the shell comes back intact. */
const ENTER_ALTERNATE_SCREEN = '\u001B[?1049h\u001B[H';
const LEAVE_ALTERNATE_SCREEN = '\u001B[?1049l';

/**
 * Runs `work` on the alternate screen and always restores the normal screen afterwards, also when
 * `work` throws, so an error message lands on the owner's shell instead of a cleared screen.
 */
export async function withAlternateScreen<T>(stream: NodeJS.WriteStream, work: () => Promise<T>): Promise<T> {
  stream.write(ENTER_ALTERNATE_SCREEN);
  try {
    return await work();
  } finally {
    stream.write(LEAVE_ALTERNATE_SCREEN);
  }
}
