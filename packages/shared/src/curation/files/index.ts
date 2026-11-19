/**
 * Node-only file helpers of the curation protocol (SPEC 0005 section 4.1, `@studio/shared/curation/files`).
 * They reuse the C5 atomic write, append and read helpers and refuse any path outside
 * `<data home>/curations/<curationId>/`. Browser code imports `@studio/shared/curation` only.
 */
export {
  CurationFileExistsError,
  appendCurationEvent,
  appendCurationSessionLine,
  createRequestedCuration,
  listCurationIds,
  readCurationCost,
  readCurationEvents,
  readCurationProposal,
  readCurationSessionLines,
  readCurationState,
  writeCurationCost,
  writeCurationProposal,
  writeCurationState,
} from './curation-files';
export {
  CurationPathError,
  curationDirectory,
  curationFilePath,
  curationLocationFromDirectory,
  type CurationLocation,
} from './paths';
