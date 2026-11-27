import { type MockFaultScenario, type ProviderModeState } from '@studio/shared/ports';
import { type ProviderName } from '@studio/shared/run-format';
import { z } from 'zod';
import { InvalidProviderModeConfigError } from './providers.errors';

/** Mode per provider; every provider is `mock` unless its variable says `live` (ADR 0002). */
export type ProviderModeSettings = Readonly<Record<ProviderName, ProviderModeState>>;

/** Nest token for the parsed settings. */
export const PROVIDER_MODE_SETTINGS = Symbol('PROVIDER_MODE_SETTINGS');

const ModeSchema = z.enum(['mock', 'live']);
const FaultSchema = z.enum(['none', 'step-failure', 'authentication-error', 'missing-output']);

function variableStem(provider: ProviderName): string {
  return `ENGINEOS_VIDEO_CREATOR_${provider.toUpperCase().replace(/-/g, '_')}`;
}

/** `ENGINEOS_VIDEO_CREATOR_CLAUDE_MODE`, `ENGINEOS_VIDEO_CREATOR_LOCAL_VOICE_MODE`, ...: `mock` (default) or `live`. */
export function modeVariable(provider: ProviderName): string {
  return `${variableStem(provider)}_MODE`;
}

/** `ENGINEOS_VIDEO_CREATOR_<PROVIDER>_MOCK_FAULT`: a SPEC 0002 A12 fault scenario; inert in live mode. */
export function mockFaultVariable(provider: ProviderName): string {
  return `${variableStem(provider)}_MOCK_FAULT`;
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
  // The variable name is reported, never its value: a mistyped key pasted here must not echo.
  if (!parsed.success) throw new InvalidProviderModeConfigError(variable);
  return parsed.data;
}

/**
 * Parsed once by the providers module factory. An unknown value fails the start (fail-fast
 * config); it never silently means mock or live.
 */
export function readProviderModeSettings(environment: Readonly<Record<string, string | undefined>>): ProviderModeSettings {
  const stateOf = (provider: ProviderName): ProviderModeState => {
    const mode = readSetting(environment, modeVariable(provider), ModeSchema, 'mock');
    if (mode === 'live') return { mode: 'live' };
    const fault: MockFaultScenario = readSetting(environment, mockFaultVariable(provider), FaultSchema, 'none');
    return { mode: 'mock', fault };
  };
  return {
    claude: stateOf('claude'),
    elevenlabs: stateOf('elevenlabs'),
    'local-voice': stateOf('local-voice'),
    capture: stateOf('capture'),
    render: stateOf('render'),
  };
}
