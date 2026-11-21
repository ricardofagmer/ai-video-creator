import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import {
  MetricBatchIdSchema,
  PublishAttemptIdSchema,
  type MetricBatchId,
  type PublishAttemptId,
} from '../../common/ids';
import { PlatformSchema, type Platform } from '../../metrics/enums';
import { RunFileError } from '../../run-files/errors';
import { PLATFORM_FOLDER_NAME, platformFileNames, platformFolderNames } from '../constants';

/*
 * Every path under `<data home>/platform/` (SPEC 0007 sections 4.6 and 6 "Files"). Ids are
 * validated (ULID, or a `PlatformSchema` name) before any join, and each result is checked to stay
 * inside its folder, so no helper can reach a path outside `platform/`.
 */

/** A path that would leave `<data home>/platform/` or name something that is not a platform file. */
export class PlatformPathError extends RunFileError {
  override readonly code = 'path-outside-run';

  constructor(filePath: string, reason: string) {
    super(`Refused platform path (${reason}): ${filePath}`, filePath);
    this.name = 'PlatformPathError';
  }
}

export type AccountFileKey = Extract<keyof typeof platformFileNames, 'account' | 'health' | 'tokenLock'>;
export type PublishFileKey = Extract<keyof typeof platformFileNames, 'request' | 'state' | 'claim' | 'cancel'>;

/**
 * The resolved `platform/` root (`DataHome.platform`); refuses a relative path or a folder with
 * another name.
 */
export function checkedPlatformRoot(platformRoot: string): string {
  if (!isAbsolute(platformRoot)) throw new PlatformPathError(platformRoot, 'platform root must be absolute');
  const root = resolve(platformRoot);
  if (basename(root) !== PLATFORM_FOLDER_NAME) {
    throw new PlatformPathError(root, `platform root must be a folder named ${PLATFORM_FOLDER_NAME}`);
  }
  return root;
}

/** Joins one already-validated name to `parent` and refuses a result that is not its direct child. */
function childOf(parent: string, name: string): string {
  const target = resolve(parent, name);
  if (dirname(target) !== parent || !target.startsWith(`${parent}${sep}`)) {
    throw new PlatformPathError(target, 'escapes its platform folder');
  }
  return target;
}

/** `platform/gates.json`. */
export function gatesFilePath(platformRoot: string): string {
  return childOf(checkedPlatformRoot(platformRoot), platformFileNames.gates);
}

/** `platform/accounts/<platform>/`. */
export function accountDirectory(platformRoot: string, platform: Platform): string {
  const accounts = childOf(checkedPlatformRoot(platformRoot), platformFolderNames.accounts);
  if (!PlatformSchema.safeParse(platform).success) throw new PlatformPathError(join(accounts, String(platform)), 'invalid platform');
  return childOf(accounts, platform);
}

/** `platform/accounts/<platform>/{account.json,health.json,token.lock}`. */
export function accountFilePath(platformRoot: string, platform: Platform, file: AccountFileKey): string {
  return childOf(accountDirectory(platformRoot, platform), platformFileNames[file]);
}

/** `platform/publish/`. */
export function publishRoot(platformRoot: string): string {
  return childOf(checkedPlatformRoot(platformRoot), platformFolderNames.publish);
}

/** `platform/publish/<attemptId>/`. */
export function publishAttemptDirectory(platformRoot: string, attemptId: PublishAttemptId): string {
  const root = publishRoot(platformRoot);
  if (!PublishAttemptIdSchema.safeParse(attemptId).success) throw new PlatformPathError(root, 'invalid attemptId');
  return childOf(root, attemptId);
}

/** `platform/publish/<attemptId>/{request.json,state.json,claim,cancel}`. */
export function publishFilePath(platformRoot: string, attemptId: PublishAttemptId, file: PublishFileKey): string {
  return childOf(publishAttemptDirectory(platformRoot, attemptId), platformFileNames[file]);
}

/** `platform/polls/cursor.json`. */
export function pollCursorFilePath(platformRoot: string): string {
  const polls = childOf(checkedPlatformRoot(platformRoot), platformFolderNames.polls);
  return childOf(polls, platformFileNames.pollCursor);
}

/** `platform/metrics-inbox/`. */
export function metricsInboxDirectory(platformRoot: string): string {
  return childOf(checkedPlatformRoot(platformRoot), platformFolderNames.metricsInbox);
}

/** `platform/metrics-inbox/<batchId>.json`. */
export function metricBatchFilePath(platformRoot: string, batchId: MetricBatchId): string {
  const inbox = metricsInboxDirectory(platformRoot);
  if (!MetricBatchIdSchema.safeParse(batchId).success) throw new PlatformPathError(inbox, 'invalid batchId');
  return childOf(inbox, `${batchId}.json`);
}
