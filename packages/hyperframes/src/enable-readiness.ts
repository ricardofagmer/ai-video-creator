import { engineState, HYPERFRAMES_FORMAT_VERSION, type HyperframesEngineFiles, type HyperframesEngineState } from '@studio/shared/hyperframes';

/*
 * What `enable` would get (SPEC 0008 section 7): the engine state with `engine.json` taken as
 * enabled, so status and doctor can say which step is still missing before the owner enables.
 * It reads the gate files only; the render runtime gate still decides each render.
 */

/** `engineState` reads only `state` from `engine.json`; the other fields exist to satisfy its type. */
const ENABLED_ENGINE: HyperframesEngineFiles['engine'] = {
  status: 'present',
  value: { format: HYPERFRAMES_FORMAT_VERSION, state: 'enabled', updatedAt: new Date(0).toISOString(), updatedBy: 'readiness' },
};

export function enableReadiness(files: HyperframesEngineFiles, current: { profileSha256: string }): HyperframesEngineState {
  return engineState({ ...files, engine: ENABLED_ENGINE }, current);
}
