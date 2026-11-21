/**
 * Node-only file helpers of the HyperFrames protocol (SPEC 0008 section 4.5,
 * `@studio/shared/hyperframes/files`). Every path comes from `hyperframesPaths`, so no helper
 * reaches outside `<data home>/hyperframes/`. Writers, by process: only the CLI imports
 * `ensureHyperframesFolders`, `writeEngineFile`, `writeChromeFile` and `writeTraceFile`; the
 * watcher imports the readers. Browser code imports `@studio/shared/hyperframes` only.
 */
export {
  ensureHyperframesFolders,
  readChromeFile,
  readEngineFile,
  readHyperframesEngineFiles,
  readTraceFile,
  writeChromeFile,
  writeEngineFile,
  writeTraceFile,
} from './engine-file-io';
