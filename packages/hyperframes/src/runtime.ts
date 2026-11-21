/**
 * Everything a HyperFrames process needs, resolved by the caller before any start (SPEC 0008
 * section 4.4). All paths are absolute. `path` is `StageSettings.path`, the PATH the CLI needs
 * for ffmpeg; nothing here is read from the caller's own environment.
 */
export interface HyperframesBaseRuntime {
  nodePath: string;
  binPath: string;
  configDir: string;
  cacheDir: string;
  homeDir: string;
  tmpDir: string;
  path: string;
}

/**
 * A render additionally needs the installed Chrome and the sandbox inputs (SPEC 0008 section 17.5).
 * Every path below reaches the profile as a `-D` parameter, so each must be a real path (symlinks
 * resolved) computed by the caller before the start (K16, U14).
 */
export interface HyperframesRuntime extends HyperframesBaseRuntime {
  browserPath: string;
  sandboxProfilePath: string;
  ownerConfigDir: string;
  /** Real path of the owner's home (`OWNER_HOME`). */
  ownerHomeDir: string;
  /** Real path of the monorepo root (`STUDIO_ROOT`). */
  studioRoot: string;
  /** Real path of the data home root (`DATA_HOME`). */
  dataHomeRoot: string;
  /** Real path of `<data home>/hyperframes` (`HF_ROOT`). */
  hyperframesRoot: string;
  /** Real path of `<cacheDir>/chrome` (`CHROME_DIR`); the real `browserPath` sits inside it. */
  chromeDir: string;
  /** Real path of the ffmpeg binary (`FFMPEG_BIN`). */
  ffmpegBin: string;
  /** Real path of the ffprobe binary (`FFPROBE_BIN`). */
  ffprobeBin: string;
  /** The studio api's loopback port, 1024 to 65535 (`STUDIO_API_PORT`). */
  apiPort: number;
  /** The studio web's loopback port, 1024 to 65535 (`STUDIO_WEB_PORT`). */
  webPort: number;
}
