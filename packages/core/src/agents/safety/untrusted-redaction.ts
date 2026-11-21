import { DelimiterTagSchema, escapeDelimiterTags, type AgentPacket, type ModelRoleName } from '@studio/shared/agents';
import { type RenderedPrompt } from '../adapters/claude-adapter';
import { AgentRunError } from '../agents.errors';
import { packetParsers } from '../call/role-parsers';
import { rolePrompts } from '../prompts';

/** One redaction pass over a string; throws (fail closed) when the redactor cannot run. */
export type RedactText = (text: string) => Promise<string>;

const tagAlternation = DelimiterTagSchema.options.join('|');

/** A string that is exactly one delimiter block: opening tag with attributes, body, matching closing tag. */
const WHOLE_BLOCK_PATTERN = new RegExp(`^(<(${tagAlternation})(?: [a-z][a-z-]*="[^"<>]*")*>)([\\s\\S]*)(</\\2>)$`);

/**
 * An opening or closing delimiter tag in rendered prompt text. The packet is rendered as JSON, so
 * attribute quotes may appear escaped (`ref=\"...\"`). Embedded tags inside a block body are
 * escaped to `&lt;...` by the packet builder and never match.
 */
const DELIMITER_TAG_PATTERN = new RegExp(`</?(?:${tagAlternation})(?: [a-z][a-z-]*=\\\\?"[^"<>]*?\\\\?")*>`, 'g');

async function redactBlockBody(text: string, redact: RedactText): Promise<string> {
  const match = WHOLE_BLOCK_PATTERN.exec(text);
  if (match === null) return text;
  const [, opening = '', , body = '', closing = ''] = match;
  // A body that still holds an unescaped protocol tag is not a builder block; the segment pass covers it.
  if (escapeDelimiterTags(body) !== body) return text;
  return `${opening}${escapeDelimiterTags(await redact(body))}${closing}`;
}

/**
 * L2: the untrusted text of every delimited packet field is redacted on its own, before it is
 * rendered next to anything else, so a secret-looking value at the end of a body can never
 * consume the closing tag. The tags are kept verbatim; only the body is redacted and re-escaped.
 * Returns a structural copy; non-block strings are left for the rendered-text pass.
 */
export async function redactDelimitedBlocks(value: unknown, redact: RedactText): Promise<unknown> {
  if (typeof value === 'string') return redactBlockBody(value, redact);
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) items.push(await redactDelimitedBlocks(item, redact));
    return items;
  }
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = await redactDelimitedBlocks(item, redact);
    return copy;
  }
  return value;
}

/**
 * Redacts rendered prompt text one segment at a time, splitting at every delimiter tag, so no
 * secret pattern can match across a tag and swallow it. Tags themselves are never redacted.
 */
export async function redactBetweenDelimiters(text: string, redact: RedactText): Promise<string> {
  const parts: string[] = [];
  let segmentStart = 0;
  for (const match of text.matchAll(DELIMITER_TAG_PATTERN)) {
    const segment = text.slice(segmentStart, match.index);
    parts.push(segment === '' ? segment : await redact(segment), match[0]);
    segmentStart = match.index + match[0].length;
  }
  const tail = text.slice(segmentStart);
  parts.push(tail === '' ? tail : await redact(tail));
  return parts.join('');
}

/**
 * Static role instructions plus the packet rendering, redacted before it can leave (L2). Each
 * untrusted block body is redacted on its own first, then the rendered text is redacted between
 * the delimiter tags, so no pass can match across a tag and swallow it. The redacted packet is
 * re-checked against the role's C7 schema; a replacement that pushed a block past its cap fails
 * closed as `redaction-failed`.
 */
export async function renderRedactedPrompt<Role extends ModelRoleName>(
  role: Role,
  packet: AgentPacket<Role>,
  redact: RedactText,
): Promise<RenderedPrompt> {
  const parsed = packetParsers[role](await redactDelimitedBlocks(packet, redact));
  if (!parsed.success) throw new AgentRunError(role, { kind: 'redaction-failed' });
  const prompt = rolePrompts[role];
  const rendered = prompt.render(parsed.data);
  return {
    instructions: prompt.system,
    stablePrefix: rendered.stablePrefix === null ? null : await redactBetweenDelimiters(rendered.stablePrefix, redact),
    body: await redactBetweenDelimiters(rendered.body, redact),
  };
}
