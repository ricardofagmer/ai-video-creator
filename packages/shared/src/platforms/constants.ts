import { type Platform } from '../metrics/enums';
import { type CapabilityStatus, type GateState, type PlatformCapability, type Visibility } from './enums';

/*
 * Platform protocol constants (SPEC 0007 section 4.2). Every name, bound and default the api,
 * watcher, web and CLI agree on for connected platforms lives here and nowhere else.
 */

/** `<data home>/platform/`: the one folder every platform file lives under (section 4.6). */
export const PLATFORM_FOLDER_NAME = 'platform';

/** Version of the on-disk platform files; a reader refuses a higher number (ADR 0003 decision 5). */
export const PLATFORM_FORMAT_VERSION = 1;

/** Folders inside `platform/`; no other folder name is ever resolved there (section 4.6). */
export const platformFolderNames = {
  accounts: 'accounts',
  publish: 'publish',
  polls: 'polls',
  metricsInbox: 'metrics-inbox',
} as const;

/**
 * Files inside `platform/` (section 4.2). `gates` sits at the root, `account`, `health` and
 * `tokenLock` in `accounts/<platform>/`, `request`, `state`, `claim` and `cancel` in
 * `publish/<attemptId>/`, `pollCursor` in `polls/`. Writers: section 4.6 and ADR 0003.
 */
export const platformFileNames = {
  account: 'account.json',
  health: 'health.json',
  tokenLock: 'token.lock',
  gates: 'gates.json',
  request: 'request.json',
  state: 'state.json',
  claim: 'claim',
  cancel: 'cancel',
  pollCursor: 'cursor.json',
} as const;
export type PlatformFileKey = keyof typeof platformFileNames;

/** Both gates of one platform. */
export type PlatformGates = Readonly<Record<PlatformCapability, GateState>>;

/** OD2: YouTube starts open; Instagram and TikTok wait for the owner after their platform's review. */
const gatesBeforeAnyChange: Record<Platform, PlatformGates> = {
  youtube: { metrics: 'enabled', publish: 'enabled' },
  instagram: { metrics: 'awaiting-review', publish: 'awaiting-review' },
  tiktok: { metrics: 'awaiting-review', publish: 'awaiting-review' },
};
export const defaultGates: Readonly<Record<Platform, PlatformGates>> = Object.freeze(gatesBeforeAnyChange);

/**
 * OD8: Instagram is metrics-only in R4. Its `publish` gate stays `awaiting-review` and cannot be
 * enabled (`applyGateChange` refuses with `platform-publish-unsupported`).
 */
export const platformPublishSupport: Readonly<Record<Platform, boolean>> = Object.freeze({
  youtube: true,
  instagram: false,
  tiktok: true,
});

/** Section 4.2: YouTube all three; Instagram none (OD8); TikTok `private` only (inbox draft, Q2). */
const visibilitiesByPlatform: Record<Platform, readonly Visibility[]> = {
  youtube: ['public', 'unlisted', 'private'],
  instagram: [],
  tiktok: ['private'],
};
export const allowedVisibilities: Readonly<Record<Platform, readonly Visibility[]>> = Object.freeze(visibilitiesByPlatform);

/** The pt-BR label of each status, verbatim from section 5.3. */
export const capabilityStatusLabels: Readonly<Record<CapabilityStatus, string>> = Object.freeze({
  unsupported: 'Publique no aplicativo e cole o link',
  'awaiting-review': 'Aguardando revisão da plataforma',
  'not-configured': 'Aplicativo não configurado',
  disconnected: 'Conta não conectada',
  'needs-reconnect': 'Reconecte a conta',
  connected: 'Conectada',
});

/**
 * OD3 cadence and pass bounds (section 4.2): daily through day 30, weekly to day 180, then stop.
 * `backoffHours` is indexed by consecutive failed passes (level 1 to 5).
 */
export const pollRules = {
  dailyThroughDay: 30,
  weeklyEveryDays: 7,
  stopAfterDay: 180,
  maxPublicationsPerPass: 50,
  passBudgetMs: 60_000,
  minPassIntervalMs: 3_600_000,
  backoffHours: [1, 2, 4, 8, 24],
  notFoundStrikes: 3,
} as const;

/** Section 4.2. `maxArtifactBytes` is 4 GiB; `queueTtlMs` is 2 hours (B5). */
export const publishBounds = {
  queueTtlMs: 7_200_000,
  titleChars: 100,
  captionChars: 2_200,
  maxTags: 30,
  tagChars: 50,
  maxArtifactBytes: 4_294_967_296,
  transportResumes: 3,
  resumeWaitsMs: [5_000, 15_000, 45_000],
  processingChecks: 30,
  processingCheckEveryMs: 60_000,
  inboxFollowMs: 86_400_000,
  attemptsShown: 10,
} as const;

/** Section 4.2: the OAuth `state` lives 10 minutes, at most 5 pending, a 64-character PKCE verifier. */
export const oauthBounds = {
  stateTtlMs: 600_000,
  maxPendingStates: 5,
  verifierChars: 64,
} as const;

/** `token.lock` (section 5.2): O_EXCL, pid inside, stale after 60 s, removed by its finder. */
export const tokenLockBounds = {
  staleMs: 60_000,
  /**
   * The longest a holder may work under the lock (findings S1, C5): every platform call and
   * Keychain command made under it carries a timeout that ends before this, so the lock can never
   * turn stale while its holder is still about to write.
   */
  operationBudgetMs: 40_000,
} as const;

/**
 * A metrics batch file (sections 4.3 and 5.6): at most 256 KiB on disk and 50 rows, so one file
 * holds at most one pass of one platform.
 */
export const metricBatchBounds = {
  maxFileBytes: 262_144,
  maxRows: 50,
} as const;

/** Bounds of the run's `publications.jsonl` lines and of each biometric confirmation. */
export const publicationLineBounds = {
  maxBiometricRefs: 64,
  /** Newest lines returned in `RunPublishView.leftTheMachine`; the file itself is never trimmed. */
  linesShown: 100,
} as const;
