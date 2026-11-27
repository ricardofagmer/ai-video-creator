import { type PublishBiometricAssetView } from '@studio/shared/api';
import { PublishMetadataSchema, publishBounds, type Platform, type PublishMetadata, type Visibility } from '@studio/shared/platforms';
import { CliUsageError } from '../errors/cli.errors.js';
import { cliLocale, cliText } from '../i18n/messages.js';
import { type LinePrompter } from '../terminal/line-prompt.js';
import { PLATFORM_LABELS } from './platform-labels.js';

/*
 * The questions of `studio runs publish` (SPEC 0007 sections 5.4 and 5.9): title, caption, tags,
 * visibility and "Conteúdo alterado ou sintético", each checked by the shared `PublishMetadata`
 * field schemas, then the biometric list and the typed confirmation, in the active language (the
 * yes/no words, visibility words and confirmation phrase too). Nothing typed here is printed back
 * or logged; a refused answer names the field and its bounds, never the text.
 */

/** Wrong answers per question before the command gives up; nothing has been sent by then. */
const ATTEMPTS_PER_QUESTION = 3;
/** A raw answer longer than this is refused unread by the schemas (4x the longest field). */
const MAX_RAW_ANSWER = 4 * publishBounds.captionChars;

export interface PublishPromptContext {
  platform: Platform;
  /** The run title, offered as the default title when it fits (section 5.4: prefilled). */
  runTitle: string;
  allowedVisibilities: readonly Visibility[];
  /** Section 5.4: the AI disclosure is preselected when the run used a biometric asset. */
  usesBiometric: boolean;
}

type Answer<T> = { ok: true; value: T } | { ok: false; hint: string };

async function askUntilValid<T>(prompter: LinePrompter, label: string, parse: (raw: string) => Answer<T>): Promise<T> {
  let hint = '';
  for (let attempt = 0; attempt < ATTEMPTS_PER_QUESTION; attempt += 1) {
    const raw = await prompter.ask(`${hint}${label}`);
    const answer: Answer<T> = raw.length > MAX_RAW_ANSWER ? { ok: false, hint: cliText().platforms.prompt.answerTooLong } : parse(raw);
    if (answer.ok) return answer.value;
    hint = `${answer.hint}\n`;
  }
  throw new CliUsageError(cliText().platforms.prompt.tooManyInvalid);
}

function parseTitle(raw: string, fallback: string | null): Answer<string> {
  const typed = raw.trim() === '' && fallback !== null ? fallback : raw;
  const parsed = PublishMetadataSchema.shape.title.safeParse(typed);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, hint: cliText().platforms.prompt.titleBounds(publishBounds.titleChars) };
}

function parseCaption(raw: string): Answer<string> {
  const parsed = PublishMetadataSchema.shape.caption.safeParse(raw.trim());
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, hint: cliText().platforms.prompt.captionBounds(publishBounds.captionChars) };
}

/** Tags separated by commas or spaces; a leading `#` is dropped, as owners often type it. */
function parseTags(raw: string): Answer<string[]> {
  const tags = raw
    .split(/[\s,]+/u)
    .map((tag) => tag.replace(/^#/u, ''))
    .filter((tag) => tag !== '');
  const parsed = PublishMetadataSchema.shape.tags.safeParse(tags);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, hint: cliText().platforms.prompt.tagsBounds(publishBounds.maxTags, publishBounds.tagChars) };
}

/** The localized word or the raw enum value (`public`, `unlisted`, `private`) are both accepted. */
function visibilityOf(raw: string, allowed: readonly Visibility[]): Visibility | null {
  const typed = raw.trim().toLocaleLowerCase(cliLocale());
  const words = cliText().platforms.visibilities;
  return allowed.find((visibility) => typed === words[visibility] || typed === visibility) ?? null;
}

function parseYesNo(raw: string, fallback: boolean): Answer<boolean> {
  const text = cliText().platforms.prompt;
  const typed = raw.trim().toLocaleLowerCase(cliLocale());
  if (typed === '') return { ok: true, value: fallback };
  if (text.yesWords.includes(typed)) return { ok: true, value: true };
  if (text.noWords.includes(typed)) return { ok: true, value: false };
  return { ok: false, hint: text.yesNoHint };
}

/** Section 5.4 fields; visibility has no default (B7), the owner always types it. */
export async function askPublishMetadata(prompter: LinePrompter, context: PublishPromptContext): Promise<PublishMetadata> {
  const text = cliText().platforms.prompt;
  const fallbackTitle = PublishMetadataSchema.shape.title.safeParse(context.runTitle).success ? context.runTitle.trim() : null;
  const titleLabel = fallbackTitle === null ? text.title : text.titleKeep;
  const title = await askUntilValid(prompter, titleLabel, (raw) => parseTitle(raw, fallbackTitle));
  const captionLabel = context.platform === 'tiktok' ? text.captionTiktok : text.caption;
  const caption = await askUntilValid(prompter, captionLabel, parseCaption);
  const tags = await askUntilValid(prompter, text.tags, parseTags);
  const visibilityWords = cliText().platforms.visibilities;
  const words = context.allowedVisibilities.map((visibility) => visibilityWords[visibility]).join(', ');
  const visibility = await askUntilValid(prompter, text.visibility(words), (raw): Answer<Visibility> => {
    const chosen = visibilityOf(raw, context.allowedVisibilities);
    return chosen === null ? { ok: false, hint: text.visibilityHint(words) } : { ok: true, value: chosen };
  });
  const disclosureLabel = text.disclosure(context.usesBiometric ? text.yesDefault : text.noDefault);
  const aiDisclosure = await askUntilValid(prompter, disclosureLabel, (raw) => parseYesNo(raw, context.usesBiometric));
  return { title, caption, tags, visibility, aiDisclosure };
}

/** Section 5.4 (OD4): every biometric asset version by title, kind and `assetId@version`, never by path. */
export function biometricLines(platform: Platform, assets: readonly PublishBiometricAssetView[]): string[] {
  const text = cliText().platforms.prompt;
  if (assets.length === 0) return [text.noBiometric];
  return [
    text.biometricIntro(PLATFORM_LABELS[platform]),
    ...assets.map((asset) => `  - ${asset.title} (${asset.kind}, ${asset.ref})`),
  ];
}

/**
 * The exact words the owner types (`publicar youtube` in pt-BR and es, `publish youtube` in en);
 * never accepted from a flag, an argument or a pipe. Only the active language's phrase is accepted.
 */
export function confirmationPhrase(platform: Platform): string {
  return cliText().platforms.prompt.confirmationPhrase(platform);
}

/** One typed confirmation; any other answer refuses and nothing is requested. */
export async function askTypedConfirmation(prompter: LinePrompter, platform: Platform): Promise<boolean> {
  const phrase = confirmationPhrase(platform);
  const typed = await prompter.ask(cliText().platforms.prompt.confirm(phrase));
  return typed.trim() === phrase;
}
