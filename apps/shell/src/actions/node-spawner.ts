import { spawn } from 'node:child_process';
import { type ProcessExit, type SpawnRequest, type SpawnedProcess, type Spawner } from './studio-invoker';

/**
 * The production spawner. `shell: false` and an argument array, so nothing is parsed by a shell;
 * `stdio: 'ignore'` because the CLI's output may carry paths and URLs and is neither shown nor
 * logged (K7). The child is not detached and the shell keeps no handle that could signal it.
 */
export const nodeSpawner: Spawner = (request: SpawnRequest): SpawnedProcess => {
  const child = spawn(request.command, [...request.args], {
    cwd: request.cwd,
    env: { ...request.env },
    shell: request.shell,
    stdio: 'ignore',
  });
  const exits: ProcessExit[] = [];
  const waiting: Array<(exit: ProcessExit) => void> = [];
  const settle = (exit: ProcessExit): void => {
    if (exits.length > 0) return;
    exits.push(exit);
    for (const listener of waiting) listener(exit);
  };
  child.once('error', () => settle({ kind: 'spawn-error' }));
  child.once('exit', (code) => settle({ kind: 'exited', code }));
  return {
    onceSettled(listener) {
      const [exit] = exits;
      if (exit === undefined) waiting.push(listener);
      else listener(exit);
    },
  };
};
