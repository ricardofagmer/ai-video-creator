import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AbsolutePath } from '@studio/shared/catalog';
import type { LocalVoiceJob } from '@studio/shared/ports';
import { type StageSettings } from '../shared/stage-settings';
import { minimalChildEnv } from './child-env';
import { commandSignal, spawnBounded, type BoundedSpawnOutcome } from './spawn-bounded';

const MAX_LOCAL_VOICE_STDOUT_BYTES = 1024 * 1024;

/** Owner-only: from rev 4 the job can carry the registered biometric voice path (A27). */
const JOB_FILE_MODE = 0o600;

export interface LocalVoiceLine {
  sceneId: string;
  text: string;
}

export interface LocalVoiceClip {
  sceneId: string;
  text: string;
  audio: Uint8Array;
}

export type LocalVoiceOutcome =
  | { status: 'spoken'; clips: LocalVoiceClip[] }
  | { status: 'not-configured' }
  | { status: 'failed'; reason: 'timeout' | 'exit' | 'spawn' | 'no-audio' };

export interface LocalVoiceRequest {
  /** C11 `language`: `pt` or `en`. */
  language: 'pt' | 'en';
  lines: readonly LocalVoiceLine[];
  /**
   * C11 `voice` (rev 4, A27): the registered biometric voice reference path, forwarded as a string
   * only. Absent when no biometric voice is bound; the job then equals rev 3.
   */
  voice?: AbsolutePath;
  signal: AbortSignal;
  timeoutMs: number;
}

/** The C11 job; `voice` is written only when the request carries one, so a rev 3 job has no key. */
function localVoiceJob(request: LocalVoiceRequest, lines: LocalVoiceJob['lines']): LocalVoiceJob {
  return request.voice === undefined
    ? { language: request.language, lines }
    : { language: request.language, voice: request.voice, lines };
}

interface LocalVoiceRun {
  localVoice: NonNullable<StageSettings['localVoice']>;
  jobPath: string;
  job: LocalVoiceJob;
  signal: AbortSignal;
  timeoutMs: number;
}

/**
 * Writes the job file owner-only, runs the script on it, and deletes the job as soon as the script
 * exits, whatever the outcome: the job is the only copy of the voice path.
 */
async function runJob(settings: StageSettings, request: LocalVoiceRun): Promise<BoundedSpawnOutcome> {
  const { localVoice } = request;
  try {
    // `wx`: a fresh file in the fresh folder, created owner-only before any byte is written.
    await writeFile(request.jobPath, JSON.stringify(request.job), { mode: JOB_FILE_MODE, flag: 'wx' });
    return await spawnBounded({
      command: localVoice.pythonPath,
      args: [localVoice.scriptPath, request.jobPath],
      env: minimalChildEnv(settings),
      signal: commandSignal(request.signal, request.timeoutMs),
      stdin: null,
      maxStdoutBytes: MAX_LOCAL_VOICE_STDOUT_BYTES,
    });
  } finally {
    await rm(request.jobPath, { force: true });
  }
}

/**
 * C11 local voice: `<python> speak_batch.py <job.json>` (command line unchanged) with job
 * `{ language, voice?, lines: [{ text, out }] }` (SPEC 0002 rev 4, section 13.7). The job and clips
 * live in a private mkdtemp folder (0700) outside the run; the job file is owner-only (0600),
 * deleted as soon as the script exits, and the folder is removed afterwards. The child gets PATH,
 * HOME and TMPDIR only, and its argv holds the script and job paths, never the voice path.
 * `voice` is the one place the biometric reference path is written: this function never opens,
 * stats, copies, hashes or lists it. Paths and stderr are never returned, logged or written to the
 * run; a failure is reported by class only.
 */
export async function speakWithLocalVoice(settings: StageSettings, request: LocalVoiceRequest): Promise<LocalVoiceOutcome> {
  const localVoice = settings.localVoice;
  if (localVoice === null) return { status: 'not-configured' };
  const workDir = await mkdtemp(join(settings.tmpDir ?? tmpdir(), 'studio-local-voice-'));
  try {
    const clips = request.lines.map((line, index) => ({ ...line, out: join(workDir, `line-${String(index + 1).padStart(3, '0')}.wav`) }));
    const jobPath = join(workDir, 'job.json');
    const job = localVoiceJob(request, clips.map((clip) => ({ text: clip.text, out: clip.out })));
    const outcome = await runJob(settings, { localVoice, jobPath, job, signal: request.signal, timeoutMs: request.timeoutMs });
    request.signal.throwIfAborted();
    if (outcome.status === 'aborted') return { status: 'failed', reason: 'timeout' };
    if (outcome.status === 'spawn-failed') return { status: 'failed', reason: 'spawn' };
    if (outcome.status === 'output-too-large' || outcome.exitCode !== 0) return { status: 'failed', reason: 'exit' };
    const spoken: LocalVoiceClip[] = [];
    for (const clip of clips) {
      const written = await stat(clip.out).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
      });
      if (written === null || written.size === 0) return { status: 'failed', reason: 'no-audio' };
      spoken.push({ sceneId: clip.sceneId, text: clip.text, audio: await readFile(clip.out) });
    }
    return { status: 'spoken', clips: spoken };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
