import { z } from 'zod';

/*
 * HyperFrames protocol constants (SPEC 0008 section 4.2). Every name, bound and version the
 * runtime, the watcher, the catalog and the CLI agree on lives here and nowhere else.
 */

/** The exact `hyperframes` version the owner approved (vetting 0005, OD2). No range. */
export const HYPERFRAMES_PIN = '0.9.72';

/** The `chrome-headless-shell` build the pinned CLI expects (vetting 0005 section 5). */
export const HYPERFRAMES_CHROME_VERSION = '158.0.8127.36';

/** `<data home>/hyperframes/`: the one folder every HyperFrames file lives under (section 4.5). */
export const HYPERFRAMES_FOLDER_NAME = 'hyperframes';

/** Version of the on-disk HyperFrames files; a reader refuses any other number. */
export const HYPERFRAMES_FORMAT_VERSION = 1;

/** Names inside `hyperframes/`; no other name is ever resolved there. */
export const hyperframesFileNames = {
  engine: 'engine.json',
  chrome: 'chrome.json',
  trace: 'trace.json',
  config: 'config',
  cache: 'cache',
  home: 'home',
} as const;

/** The CLI's own config file inside `config/` (seeded before any process starts, U2). */
export const HYPERFRAMES_CONFIG_FILE_NAME = 'config.json';

export const HyperframesVariableTypeSchema = z.enum(['string', 'number', 'boolean', 'color', 'enum']);
export type HyperframesVariableType = z.infer<typeof HyperframesVariableTypeSchema>;

/** The closed studio vocabulary a run fills from its own data (section 5.3, OD6 answer a). */
export const studioTemplateVariables = {
  title: 'string',
  hook: 'string',
  disclosure: 'string',
  durationS: 'number',
  accent: 'color',
} as const satisfies Record<string, HyperframesVariableType>;
export type StudioTemplateVariable = keyof typeof studioTemplateVariables;

export const hyperframesBounds = {
  maxVariables: 32,
  variableNameChars: 40,
  stringChars: 500,
  enumValues: 32,
  maxFiles: 500,
  maxTextFileBytes: 2_097_152,
  traceFindings: 20,
  findingChars: 200,
  pictureFrameTolerance: 1,
} as const;

/** A variable name: a lower-case letter, then up to 39 letters or digits (section 4.3). */
export const HYPERFRAMES_VARIABLE_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,39}$/;

/** Extensions a template folder may hold (section 4.3); everything else is refused. */
export const templateFileExtensions = [
  '.html',
  '.css',
  '.js',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.woff2',
  '.ttf',
  '.otf',
  '.txt',
] as const;

export const HyperframesRefusalReasonSchema = z.enum([
  'engine-disabled',
  'trace-missing',
  'trace-stale',
  'pin-mismatch',
  'chrome-missing',
  'runtime-not-prepared',
  'sandbox-unavailable',
  'template-not-flat',
  'template-not-self-contained',
  'canvas-mismatch',
  'duration-out-of-range',
  'variable-missing',
  'variable-undeclared',
  'variable-type',
]);
export type HyperframesRefusalReason = z.infer<typeof HyperframesRefusalReasonSchema>;
