import { type AssetVersionView } from '@studio/shared/api';
import { type Language } from '@studio/shared/recipes';
import { type Locale } from '@studio/ui';

/**
 * A catalog version the api can make a voice sample of (guided-creation spec section 2): an
 * `ai-model` that is a voice clone or comes from a voice provider. The api checks the same rule
 * and answers `asset-job-not-a-voice` otherwise; this only decides where the button shows.
 */
export function isVoiceVersion(version: AssetVersionView): boolean {
  if (version.kind !== 'ai-model') return false;
  const { modelType, provider } = version.details;
  return modelType === 'voice-clone' || provider === 'elevenlabs' || provider === 'local-voice';
}

/** The sample sentence's language: the recipe's when known, else the UI's (English only for `en`). */
export function sampleLanguageFor(locale: Locale, recipeLanguage?: Language | null): Language {
  if (recipeLanguage !== undefined && recipeLanguage !== null) return recipeLanguage;
  return locale === 'en' ? 'en-US' : 'pt-BR';
}
