import { HYPERFRAMES_PIN, type HyperframesRefusalReason } from './constants';
import { type HyperframesChromeFile, type HyperframesEngineFile, type HyperframesTraceFile } from './engine-files';

/*
 * Whether the HyperFrames engine may render (SPEC 0008 section 4.5, K6, AC 70). Pure: the caller
 * reads the files (`@studio/shared/hyperframes/files`) and passes the sandbox profile hash of the
 * pinned runtime (`sandboxProfile().sha256` in `@studio/hyperframes`). An unreadable or invalid file
 * never yields `ready`.
 */

export type HyperframesFileRead<T> = { status: 'absent' } | { status: 'invalid' } | { status: 'present'; value: T };

export interface HyperframesEngineFiles {
  engine: HyperframesFileRead<HyperframesEngineFile>;
  chrome: HyperframesFileRead<HyperframesChromeFile>;
  /** The binary `chrome.json` names is a regular file inside `cache/`. */
  chromeBinaryPresent: boolean;
  /** `config/config.json` is a regular file. */
  configSeeded: boolean;
  trace: HyperframesFileRead<HyperframesTraceFile>;
}

export type HyperframesEngineState =
  | 'ready'
  | Extract<HyperframesRefusalReason, 'engine-disabled' | 'chrome-missing' | 'runtime-not-prepared' | 'trace-missing' | 'trace-stale'>;

/** First match of section 4.5. */
export function engineState(files: HyperframesEngineFiles, current: { profileSha256: string }): HyperframesEngineState {
  if (files.engine.status !== 'present' || files.engine.value.state !== 'enabled') return 'engine-disabled';
  if (files.chrome.status !== 'present' || !files.chromeBinaryPresent) return 'chrome-missing';
  if (!files.configSeeded) return 'runtime-not-prepared';
  if (files.trace.status !== 'present') return 'trace-missing';
  const trace = files.trace.value;
  if (
    trace.result !== 'pass' ||
    trace.pin !== HYPERFRAMES_PIN ||
    trace.chromeSha256 !== files.chrome.value.sha256 ||
    trace.profileSha256 !== current.profileSha256
  ) {
    return 'trace-stale';
  }
  return 'ready';
}
