import type { AbsolutePath } from '../common/ids';

/**
 * C11 job file handed to the external local voice script as `<python> speak_batch.py <job.json>`;
 * the command line is unchanged (SPEC 0002 rev 4, section 13.7, A27). `out` is the absolute path
 * the script writes each clip to, inside the private temporary folder.
 *
 * `voice` (rev 4, optional) is the absolute path of the registered biometric voice reference bound
 * to the run, as resolved by `AssetResolverPort`. It is written only into this job file: never to a
 * log line, event, activity text, `egress.jsonl` entry, run file, error message or child-process
 * argument, and watcher stage code never opens, copies, hashes, stats or lists it. Without a bound
 * biometric voice, or outside live mode, the key is omitted and the job equals rev 3.
 */
export interface LocalVoiceJob {
  language: 'pt' | 'en';
  voice?: AbsolutePath;
  lines: { text: string; out: string }[];
}
