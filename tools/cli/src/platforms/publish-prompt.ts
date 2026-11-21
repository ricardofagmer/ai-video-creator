import { type PublishBiometricAssetView } from '@studio/shared/api';
import { PublishMetadataSchema, publishBounds, type Platform, type PublishMetadata, type Visibility } from '@studio/shared/platforms';
import { CliUsageError } from '../errors/cli.errors.js';
import { type LinePrompter } from '../terminal/line-prompt.js';
import { PLATFORM_LABELS, VISIBILITY_WORDS } from './platform-labels.js';

/*
 * The questions of `studio runs publish` (SPEC 0007 sections 5.4 and 5.9): title, caption, tags,
 * visibility and "Conteúdo alterado ou sintético", each checked by the shared `PublishMetadata`
 * field schemas, then the biometric list and the typed confirmation. Nothing typed here is printed
 * back or logged; a refused answer names the field and its bounds, never the text.
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
    const answer: Answer<T> = raw.length > MAX_RAW_ANSWER ? { ok: false, hint: 'Resposta longa demais.' } : parse(raw);
    if (answer.ok) return answer.value;
    hint = `${answer.hint}\n`;
  }
  throw new CliUsageError('Respostas inválidas demais; nenhum pedido de publicação foi feito.');
}

function parseTitle(raw: string, fallback: string | null): Answer<string> {
  const typed = raw.trim() === '' && fallback !== null ? fallback : raw;
  const parsed = PublishMetadataSchema.shape.title.safeParse(typed);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, hint: `O título precisa ter de 1 a ${publishBounds.titleChars} caracteres.` };
}

function parseCaption(raw: string): Answer<string> {
  const parsed = PublishMetadataSchema.shape.caption.safeParse(raw.trim());
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, hint: `A legenda tem no máximo ${publishBounds.captionChars} caracteres.` };
}

/** Tags separated by commas or spaces; a leading `#` is dropped, as owners often type it. */
function parseTags(raw: string): Answer<string[]> {
  const tags = raw
    .split(/[\s,]+/u)
    .map((tag) => tag.replace(/^#/u, ''))
    .filter((tag) => tag !== '');
  const parsed = PublishMetadataSchema.shape.tags.safeParse(tags);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    hint: `Use até ${publishBounds.maxTags} tags de até ${publishBounds.tagChars} letras, números ou _, separadas por vírgula ou espaço.`,
  };
}

function visibilityOf(raw: string, allowed: readonly Visibility[]): Visibility | null {
  const typed = raw.trim().toLocaleLowerCase('pt-BR');
  return allowed.find((visibility) => typed === VISIBILITY_WORDS[visibility] || typed === visibility) ?? null;
}

function parseYesNo(raw: string, fallback: boolean): Answer<boolean> {
  const typed = raw.trim().toLocaleLowerCase('pt-BR');
  if (typed === '') return { ok: true, value: fallback };
  if (['s', 'sim'].includes(typed)) return { ok: true, value: true };
  if (['n', 'não', 'nao'].includes(typed)) return { ok: true, value: false };
  return { ok: false, hint: 'Responda s ou n.' };
}

/** Section 5.4 fields; visibility has no default (B7), the owner always types it. */
export async function askPublishMetadata(prompter: LinePrompter, context: PublishPromptContext): Promise<PublishMetadata> {
  const fallbackTitle = PublishMetadataSchema.shape.title.safeParse(context.runTitle).success ? context.runTitle.trim() : null;
  const titleLabel = fallbackTitle === null ? 'Título: ' : 'Título (Enter mantém o título da execução): ';
  const title = await askUntilValid(prompter, titleLabel, (raw) => parseTitle(raw, fallbackTitle));
  const captionLabel = context.platform === 'tiktok' ? 'Legenda (o TikTok recebe só o vídeo; cole a legenda no aplicativo): ' : 'Legenda: ';
  const caption = await askUntilValid(prompter, captionLabel, parseCaption);
  const tags = await askUntilValid(prompter, 'Tags (opcional, separadas por vírgula): ', parseTags);
  const words = context.allowedVisibilities.map((visibility) => VISIBILITY_WORDS[visibility]).join(', ');
  const visibility = await askUntilValid(prompter, `Visibilidade (${words}): `, (raw): Answer<Visibility> => {
    const chosen = visibilityOf(raw, context.allowedVisibilities);
    return chosen === null ? { ok: false, hint: `Digite uma destas: ${words}.` } : { ok: true, value: chosen };
  });
  const disclosureLabel = `Conteúdo alterado ou sintético? ${context.usesBiometric ? '[S/n]' : '[s/N]'} `;
  const aiDisclosure = await askUntilValid(prompter, disclosureLabel, (raw) => parseYesNo(raw, context.usesBiometric));
  return { title, caption, tags, visibility, aiDisclosure };
}

/** Section 5.4 (OD4): every biometric asset version by title, kind and `assetId@version`, never by path. */
export function biometricLines(platform: Platform, assets: readonly PublishBiometricAssetView[]): string[] {
  if (assets.length === 0) return ['Este vídeo não usa ativos biométricos.'];
  return [
    `Este vídeo usa os ativos biométricos abaixo. Ao publicar, você confirma o envio deles para ${PLATFORM_LABELS[platform]}.`,
    ...assets.map((asset) => `  - ${asset.title} (${asset.kind}, ${asset.ref})`),
  ];
}

/** The exact words the owner types; never accepted from a flag, an argument or a pipe. */
export function confirmationPhrase(platform: Platform): string {
  return `publicar ${platform}`;
}

/** One typed confirmation; any other answer refuses and nothing is requested. */
export async function askTypedConfirmation(prompter: LinePrompter, platform: Platform): Promise<boolean> {
  const phrase = confirmationPhrase(platform);
  const typed = await prompter.ask(`Para confirmar, digite exatamente "${phrase}" (qualquer outra resposta cancela): `);
  return typed.trim() === phrase;
}
