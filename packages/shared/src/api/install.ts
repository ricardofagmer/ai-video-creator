import { z } from 'zod';
import { IsoDateTimeSchema } from '../common/ids';

/**
 * Contract C1 rev 1 (`.specs/features/desktop-installer/plan.md` section 2, ADR 0010 decisions 6
 * and 7): what the hosted portal may read from the local api through the owner's browser.
 *
 * | Method | Path | Auth | Response |
 * |---|---|---|---|
 * | GET | /install/presence | none | 200 InstallPresence |
 * | POST | /install/pair | body InstallPairRequest | 200 InstallPairing, or 401 with no body |
 * | GET | /install/status | `Authorization: Bearer <token>` | 200 InstallStatus, or 401 with no body |
 *
 * No field carries a path, user name, host name, port list, catalog data or secret. The only
 * cross-origin caller is the configured portal origin, on these three routes only, never with
 * credentials. A request whose `Host` is not the api's own loopback host answers 421.
 * A change to any shape here increments `INSTALL_CONTRACT_VERSION`.
 */
export const INSTALL_CONTRACT_VERSION = 1;
export const INSTALL_PRODUCT = 'engineos-video-creator';

/** Platforms the installer ships for; phase 2 adds Windows with the same contract. */
export const InstallPlatformSchema = z.enum(['darwin-arm64', 'win32-x64']);
export type InstallPlatform = z.infer<typeof InstallPlatformSchema>;

/** Semantic version of the installed app (`MAJOR.MINOR.PATCH`, optional pre-release). */
export const InstallVersionSchema = z
  .string()
  .max(64)
  .regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/);
export type InstallVersion = z.infer<typeof InstallVersionSchema>;

/** `GET /install/presence`: public, exactly these five fields (DI-AC-07). */
export const InstallPresenceSchema = z
  .object({
    product: z.literal(INSTALL_PRODUCT),
    contract: z.literal(INSTALL_CONTRACT_VERSION),
    version: InstallVersionSchema,
    platform: InstallPlatformSchema,
    /** True when at least one portal token exists. */
    paired: z.boolean(),
  })
  .strict();
export type InstallPresence = z.infer<typeof InstallPresenceSchema>;

/**
 * Pair codes avoid characters a person confuses when reading them aloud or copying them
 * (`0`/`O`, `1`/`I`/`L`). The shell issues them through the CLI; the portal receives one in the
 * URL fragment, which the browser never sends to a server.
 */
export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_LENGTH = 8;
export const PAIR_CODE_TTL_MS = 5 * 60 * 1000;
export const PAIR_CODE_MAX_FAILED_ATTEMPTS = 5;

export const PairCodeSchema = z.string().regex(new RegExp(`^[${PAIR_CODE_ALPHABET}]{${PAIR_CODE_LENGTH}}$`));
export type PairCode = z.infer<typeof PairCodeSchema>;

/** `POST /install/pair` body. */
export const InstallPairRequestSchema = z
  .object({
    code: PairCodeSchema,
  })
  .strict();
export type InstallPairRequest = z.infer<typeof InstallPairRequestSchema>;

/** 43 characters: base64url, no padding, of 32 random bytes. */
export const InstallTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export type InstallToken = z.infer<typeof InstallTokenSchema>;

/** The api keeps at most this many portal tokens; pairing past it drops the oldest. */
export const MAX_LIVE_INSTALL_TOKENS = 5;

/** `POST /install/pair` (200). The token is returned once and stored by the api only as SHA-256. */
export const InstallPairingSchema = z
  .object({
    token: InstallTokenSchema,
  })
  .strict();
export type InstallPairing = z.infer<typeof InstallPairingSchema>;

/** `not-installed` on an optional component (search model, capture browser) is not an error. */
export const ComponentStateSchema = z.enum(['ok', 'missing', 'stopped', 'degraded', 'not-installed']);
export type ComponentState = z.infer<typeof ComponentStateSchema>;

export const InstallComponentsSchema = z
  .object({
    api: z.literal('ok'),
    web: ComponentStateSchema,
    watcher: ComponentStateSchema,
    database: ComponentStateSchema,
    ffmpeg: ComponentStateSchema,
    searchModel: ComponentStateSchema,
    captureBrowser: ComponentStateSchema,
    dataHome: ComponentStateSchema,
  })
  .strict();
export type InstallComponents = z.infer<typeof InstallComponentsSchema>;

/** `GET /install/status`: needs a portal token (DI-AC-10). */
export const InstallStatusSchema = z
  .object({
    contract: z.literal(INSTALL_CONTRACT_VERSION),
    version: InstallVersionSchema,
    platform: InstallPlatformSchema,
    checkedAt: IsoDateTimeSchema,
    components: InstallComponentsSchema,
    setup: z.enum(['complete', 'pending']),
  })
  .strict();
export type InstallStatus = z.infer<typeof InstallStatusSchema>;
