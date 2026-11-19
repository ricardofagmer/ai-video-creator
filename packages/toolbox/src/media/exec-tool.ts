import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ExternalToolError, isErrnoException } from '../errors';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const STDERR_TAIL_CHARS = 1500;

export interface ToolOutput {
  stdout: string;
  stderr: string;
}

function stderrOf(error: unknown): string {
  if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string') return error.stderr;
  return '';
}

/** Runs a local tool with an argument array (never a shell), capturing its output. */
export async function runTool(command: string, args: readonly string[], timeoutMs: number): Promise<ToolOutput> {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], { maxBuffer: MAX_OUTPUT_BYTES, timeout: timeoutMs, encoding: 'utf8' });
    return { stdout, stderr };
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      throw new ExternalToolError(`${command} not found; install ffmpeg (brew install ffmpeg) or set FFMPEG_PATH/FFPROBE_PATH`, command);
    }
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new ExternalToolError(`${command} failed: ${detail}\n${stderrOf(error).slice(-STDERR_TAIL_CHARS)}`, command);
  }
}
