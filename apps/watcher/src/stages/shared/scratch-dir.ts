import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type StageSettings } from './stage-settings';

/**
 * A private folder outside the run for one step's intermediate media. Tools write here; the
 * executor then moves each result into its declared run path through the C5 atomic write, so a
 * half-written file never appears in the run and ffmpeg's no-overwrite rule holds on retries.
 */
export async function withScratchDir<T>(settings: StageSettings, work: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(settings.tmpDir ?? tmpdir(), 'studio-stage-'));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
