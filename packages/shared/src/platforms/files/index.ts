/**
 * Node-only file helpers of the platform protocol (SPEC 0007 sections 4.6 and 5.2,
 * `@studio/shared/platforms/files`). They reuse the C5 atomic write and read helpers, validate every
 * id before a path join and refuse any path outside `<data home>/platform/`. Folders are `0700`,
 * files `0600`. Browser code imports `@studio/shared/platforms` only.
 *
 * Writers, by process (K2, AC 57): the api and the CLI import `writeGatesFile`, `writeAccountFile`,
 * `createPublishRequest`, `createCancelMarker` and `deleteMetricBatch`; the watcher imports
 * `writeHealthFile`, `claimPublishAttempt`, `writePublishState`, `writePollCursor` and
 * `createMetricBatch`. `acquireTokenLock` and `releaseTokenLock` serve all three; every reader
 * serves anyone.
 */
export {
  readAccountFile,
  readGatesFile,
  readHealthFile,
  writeAccountFile,
  writeGatesFile,
  writeHealthFile,
} from './connection-files';
export {
  PlatformPathError,
  accountDirectory,
  accountFilePath,
  checkedPlatformRoot,
  gatesFilePath,
  metricBatchFilePath,
  metricsInboxDirectory,
  pollCursorFilePath,
  publishAttemptDirectory,
  publishFilePath,
  publishRoot,
  type AccountFileKey,
  type PublishFileKey,
} from './paths';
export {
  MetricBatchExistsError,
  MetricBatchRefusedError,
  createMetricBatch,
  deleteMetricBatch,
  listMetricBatchIds,
  readMetricBatch,
  readPollCursor,
  writePollCursor,
  type ReadMetricBatch,
} from './poll-files';
export {
  PublishAttemptExistsError,
  claimPublishAttempt,
  createCancelMarker,
  createPublishRequest,
  hasCancelMarker,
  listPublishAttemptIds,
  readPublishClaim,
  isPublishClaimantAlive,
  publishMetadataSha256,
  readPublishRequest,
  readPublishState,
  writePublishState,
  type CancelMarkerResult,
  type PublishClaimResult,
} from './publish-files';
export { acquireTokenLock, holdsTokenLock, releaseTokenLock, type TokenLockResult } from './token-lock';
