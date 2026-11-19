/**
 * Curation protocol constants (SPEC 0005 section 4.2, topology 0004 section 4). Every string and
 * bound the api, watcher, web and CLI agree on for a curation lives here and nowhere else.
 */

/**
 * Model role of the Curator. It fits the shape check `ModelRoleSchema` of the run format, but it is
 * deliberately not a member of the run-bound `ModelRoleNameSchema` (SPEC 0005 L2, Q6).
 */
export const CURATOR_ROLE = 'curator';

/** Instruction version recorded on every Curator session end line, failed calls included. */
export const CURATOR_INSTRUCTION_VERSION = 'curator@1';

/** `<data home>/curations/`: the one folder every curation file lives under (section 4.6). */
export const CURATIONS_FOLDER_NAME = 'curations';

/** Files inside `curations/<curationId>/`; no other name is ever read or written there. */
export const curationFileNames = {
  curation: 'curation.json',
  proposal: 'proposal.json',
  cost: 'cost.json',
  events: 'events.jsonl',
  session: 'session.jsonl',
} as const;
export type CurationFileKey = keyof typeof curationFileNames;

/** Topology 0004 section 7 bounds, as SPEC 0005 section 4.2 freezes them. */
export const curationBounds = {
  maxCalls: 2,
  callTimeoutMs: 120_000,
  curationTimeoutMs: 300_000,
  maxOutputTokens: 8_000,
  maxBodyChars: 16_000,
  maxUsd: 1,
  maxQueued: 3,
  maxDeclined: 3,
  maxRuns: 20,
  maxNotes: 10,
  maxEvidence: 5,
  excerptChars: 600,
  focusChars: 500,
  declineReasonChars: 300,
  diffChars: 80_000,
} as const;
