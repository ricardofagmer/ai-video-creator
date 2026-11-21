import { PlatformSchema, type Platform, type PlatformMode } from '@studio/shared/platforms';
import { z } from 'zod';

/*
 * Mock mode and fault scenarios per platform (SPEC 0007 section 5.8), parsed with the fail-fast
 * reader the providers use (`provider-modes.config.ts`). The names are not added to
 * `ProviderNameSchema`, which is part of the run format (L7).
 */

/** Section 5.8: what a mock client simulates; inert in live mode. */
export const PlatformMockFaultSchema = z.enum(['none', 'token-revoked', 'rate-limited', 'quota-exhausted', 'upload-fails', 'outcome-unknown']);
export type PlatformMockFault = z.infer<typeof PlatformMockFaultSchema>;

export type PlatformModeState = { mode: 'live' } | { mode: 'mock'; fault: PlatformMockFault };

/** Mode per platform; every platform is `mock` unless its variable says `live`. */
export type PlatformModeSettings = Readonly<Record<Platform, PlatformModeState>>;

/** Nest token for the parsed settings. */
export const PLATFORM_MODE_SETTINGS = Symbol('PLATFORM_MODE_SETTINGS');

const ModeSchema = z.enum(['mock', 'live']);

/** A platform mode variable holds a value outside its enum; the start fails, the value is never echoed. */
export class InvalidPlatformModeConfigError extends Error {
  readonly category = 'validation';

  constructor(readonly variable: string) {
    super(`Invalid value in ${variable}; see SPEC 0007 section 5.8`);
    this.name = 'InvalidPlatformModeConfigError';
  }
}

function variableStem(platform: Platform): string {
  return `VIDEO_STUDIO_PLATFORM_${platform.toUpperCase()}`;
}

/** `VIDEO_STUDIO_PLATFORM_YOUTUBE_MODE`, ...: `mock` (default) or `live`. */
export function platformModeVariable(platform: Platform): string {
  return `${variableStem(platform)}_MODE`;
}

/** `VIDEO_STUDIO_PLATFORM_<PLATFORM>_MOCK_FAULT`: a section 5.8 fault scenario. */
export function platformMockFaultVariable(platform: Platform): string {
  return `${variableStem(platform)}_MOCK_FAULT`;
}

function readSetting<T extends string>(
  environment: Readonly<Record<string, string | undefined>>,
  variable: string,
  schema: z.ZodType<T, unknown>,
  fallback: T,
): T {
  const raw = environment[variable]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new InvalidPlatformModeConfigError(variable);
  return parsed.data;
}

/**
 * Parsed once by the platforms module factory. An unknown value fails the start; it never silently
 * means mock or live.
 */
export function readPlatformModeSettings(environment: Readonly<Record<string, string | undefined>>): PlatformModeSettings {
  const stateOf = (platform: Platform): PlatformModeState => {
    const mode = readSetting(environment, platformModeVariable(platform), ModeSchema, 'mock');
    if (mode === 'live') return { mode: 'live' };
    return { mode: 'mock', fault: readSetting(environment, platformMockFaultVariable(platform), PlatformMockFaultSchema, 'none') };
  };
  const settings: Record<Platform, PlatformModeState> = {
    youtube: stateOf('youtube'),
    instagram: stateOf('instagram'),
    tiktok: stateOf('tiktok'),
  };
  return Object.freeze(settings);
}

/** The process mode of one platform. */
export function platformModeOf(settings: PlatformModeSettings, platform: Platform): PlatformMode {
  return settings[platform].mode;
}

/** Every platform, in the order views list them. */
export const allPlatforms: readonly Platform[] = PlatformSchema.options;
