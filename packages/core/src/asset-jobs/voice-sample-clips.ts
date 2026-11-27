import { lstat } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { isTerminalAssetJobStatus, voiceSampleBounds, type VoiceSampleJobFile } from '@studio/shared/asset-jobs';
import {
  assetJobDirectory,
  assetJobFilePath,
  readAssetJobState,
  removeAssetJobSamples,
  type AssetJobLocation,
} from '@studio/shared/asset-jobs/files';
import { type AssetRef } from '@studio/shared/catalog';
import { type DataHome } from '../paths/data-home';

const logger = new Logger('VoiceSampleClips');

/**
 * Guided-creation design section 2 "The clone": a voice's kept sample clips are deleted when the
 * version is deprecated. Best effort and silent to the caller: the status change already happened
 * and must not fail because of a clip. Only an ended job is touched, so the watcher never loses a
 * clip it is writing; `job.json` stays as the record that a sample existed. Imports nothing from
 * the catalog, which calls it. The log names the ref and an error name, never the clip's path.
 */
export async function removeDeprecatedVoiceSamples(dataHome: DataHome, ref: AssetRef): Promise<void> {
  const location: AssetJobLocation = { assetJobsRoot: dataHome.assetJobs, kind: 'voice-sample', ref };
  try {
    const state = await readAssetJobState(location);
    if (state.status === 'absent' || !isTerminalAssetJobStatus(state.value.status)) return;
    await removeAssetJobSamples(location);
    logger.log({ event: 'asset-job.samples-removed', ref, reason: 'voice-deprecated' });
  } catch (error) {
    logger.warn({ event: 'asset-job.samples-remove-failed', ref, errorName: error instanceof Error ? error.name : 'unknown' });
  }
}

/**
 * True when a `done` sample's clip is still a regular, non-empty, in-bounds file directly inside a
 * real job folder: the checks `GetVoiceSampleAudio` streams under, without telling which failed.
 * A clip removed by hand, by a deprecation or by a crash makes the done job unplayable.
 */
export async function isVoiceSampleClipPresent(location: AssetJobLocation, job: VoiceSampleJobFile): Promise<boolean> {
  if (job.status !== 'done' || job.audio === undefined) return false;
  try {
    if (!(await lstat(assetJobDirectory(location))).isDirectory()) return false;
    const stats = await lstat(assetJobFilePath(location, job.audio === 'mp3' ? 'sampleMp3' : 'sampleWav'));
    return stats.isFile() && stats.size > 0 && stats.size <= voiceSampleBounds.audioMaxBytes;
  } catch {
    // Missing or unreadable reads as absent: the caller offers a new sample instead of a dead clip.
    return false;
  }
}
