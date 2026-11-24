/**
 * Reads `name` and `description` from a SKILL.md front matter block (`key: value` lines between two
 * `---` fences). The file is untrusted: every other key and the body are ignored, values are single
 * line and capped, and nothing here is ever rendered as HTML.
 */
export const FRONT_MATTER_NAME_MAX = 200;
export const FRONT_MATTER_DESCRIPTION_MAX = 1000;

/** Front matter is at the top; reading more of a large file buys nothing. */
const MAX_SCANNED_CHARACTERS = 64 * 1024;

export interface SkillFrontMatter {
  name: string;
  description: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const first = trimmed.charAt(0);
  const quoted = trimmed.length >= 2 && (first === '"' || first === "'") && trimmed.endsWith(first);
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

/** Empty strings when the file has no front matter or the keys are missing. */
export function parseSkillFrontMatter(text: string): SkillFrontMatter {
  const lines = text.slice(0, MAX_SCANNED_CHARACTERS).split(/\r?\n/);
  const closing = lines.indexOf('---', 1);
  if (lines[0]?.trim() !== '---' || closing === -1) return { name: '', description: '' };
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, closing)) {
    const separator = line.indexOf(':');
    if (separator <= 0 || line.startsWith(' ') || line.startsWith('\t')) continue;
    const key = line.slice(0, separator).trim();
    if ((key === 'name' || key === 'description') && !fields.has(key)) fields.set(key, unquote(line.slice(separator + 1)));
  }
  return {
    name: (fields.get('name') ?? '').slice(0, FRONT_MATTER_NAME_MAX),
    description: (fields.get('description') ?? '').slice(0, FRONT_MATTER_DESCRIPTION_MAX),
  };
}

/** One front matter value on one line; quoted when YAML would misread it. */
function frontMatterValue(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim();
  const needsQuotes = /^[\s"'#&*!|>%@`[\]{}-]/.test(line) || line.includes(': ') || line.endsWith(':') || line.includes(' #');
  return needsQuotes ? `"${line.replace(/"/g, "'")}"` : line;
}

/** SKILL.md text for a new skill: the generated front matter, then the developer's text as typed. */
export function skillMarkdownOf(name: string, description: string, body: string): string {
  const header = ['---', `name: ${frontMatterValue(name)}`, `description: ${frontMatterValue(description)}`, '---'].join('\n');
  const trimmedBody = body.replace(/^\s*\n/, '').trimEnd();
  return trimmedBody === '' ? `${header}\n` : `${header}\n\n${trimmedBody}\n`;
}
