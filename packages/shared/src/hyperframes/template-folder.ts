import { hyperframesBounds, templateFileExtensions } from './constants';
import { templateIssue, type TemplateIssue } from './template-issues';

/*
 * Folder rules of a HyperFrames template (SPEC 0008 sections 4.3 and 17.7, vetting 0004
 * condition 3): the template is self-contained. The caller lists the folder without following
 * links and passes the text of every `.html`, `.css`, `.svg` and `.js` file; this pure check never
 * touches a disk. Script files are scanned only for the timeline marker, never for URLs.
 *
 * This is a lint, not the boundary (K19): `--strict` and the render sandbox are. Known limits,
 * not closed by rev 2: CSS escapes (`\68ttps:`), URLs built by a script, and HTML the lint
 * mistakes for text or the reverse (comments, CDATA, script bodies). A false positive refuses a
 * template and the author rewrites the line.
 */

export interface TemplateFolderEntry {
  /** Relative POSIX path inside the template folder. */
  path: string;
  type: 'file' | 'symlink' | 'other';
  /** Text of a `.html`, `.css`, `.svg` or `.js` file; null when it was not read. */
  text: string | null;
}

/** A reference found in a file, or a value that cannot be shown to carry no scheme. */
type FoundReference = { kind: 'value'; value: string } | { kind: 'undecodable' };

const TEXT_SCANNED = new Set(['.html', '.css', '.svg']);
const TEXT_REQUIRED = new Set(['.html', '.css', '.svg', '.js']);
const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set(templateFileExtensions);
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/;

/*
 * Every pattern below is linear: each repetition is a single character class with no nested
 * quantifier, so a backtrack never multiplies over template text.
 *
 * Reference attributes of section 17.7 rule 2. The name must follow white space, `/`, `"` or `'`
 * (rule 1), so `<img/src=…>` and `<img alt="a"src=…>` match while `data-src` and
 * `data-no-timeline` do not; `xmlns` and `xmlns:*` are not references and are not named here.
 */
const ATTRIBUTE_PATTERN =
  /(?<=[\s/"'])(xlink:href|imagesrcset|srcset|formaction|background|codebase|longdesc|manifest|classid|archive|profile|usemap|lowsrc|dynsrc|poster|action|href|src|data|cite|ping|icon)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*))\s*\)/gi;
const CSS_IMPORT_PATTERN = /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s"');]+))/gi;
const IMAGE_SET_PATTERN = /(?:-webkit-)?image-set\(/gi;
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;
const META_HTTP_EQUIV_PATTERN = /(?<=[\s/"'])http-equiv\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const META_CONTENT_PATTERN = /(?<=[\s/"'])content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const REFRESH_URL_PREFIX_PATTERN = /^url\s*=\s*/i;

/* Section 17.7 rule 3: one pass, as a browser decodes an attribute value. */
const CHARACTER_REFERENCE_PATTERN =
  /&(?:#(\d+);?|#[xX]([0-9a-fA-F]+);?|(colon|sol|bsol|period|Tab|NewLine|amp|lt|gt|quot|apos|nbsp);|(amp|lt|gt|quot))/g;
const UNDECODED_REFERENCE_PATTERN = /&#?[a-zA-Z0-9]+;/;
const NAMED_REFERENCES: Readonly<Record<string, string>> = {
  colon: ':',
  sol: '/',
  bsol: '\\',
  period: '.',
  Tab: '\t',
  NewLine: '\n',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const MAX_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER = '�';

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

function percentDecoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape is checked as written; it cannot hide a `..` segment from the raw check.
    return value;
  }
}

function codePointText(digits: string, radix: 10 | 16): string {
  const codePoint = Number.parseInt(digits, radix);
  const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
  if (!Number.isFinite(codePoint) || codePoint === 0 || codePoint > MAX_CODE_POINT || isSurrogate) return REPLACEMENT_CHARACTER;
  return String.fromCodePoint(codePoint);
}

function decodeCharacterReferences(text: string): string {
  return text.replace(
    CHARACTER_REFERENCE_PATTERN,
    (_match: string, decimal?: string, hexadecimal?: string, named?: string, legacy?: string): string => {
      if (decimal !== undefined) return codePointText(decimal, 10);
      if (hexadecimal !== undefined) return codePointText(hexadecimal, 16);
      return NAMED_REFERENCES[named ?? legacy ?? ''] ?? '';
    },
  );
}

/* Section 17.7 rule 4, as the WHATWG URL parser does: drop TAB, CR and LF, trim C0 and space. */
function urlParserNormalized(value: string): string {
  const withoutBreaks = value.replace(/[\t\n\r]/g, '');
  let start = 0;
  let end = withoutBreaks.length;
  while (start < end && withoutBreaks.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && withoutBreaks.charCodeAt(end - 1) <= 0x20) end -= 1;
  return withoutBreaks.slice(start, end);
}

/** The issue a reference raises, or null when it is a relative path that stays inside the folder. */
function referenceIssue(reference: string, at: string): TemplateIssue | null {
  const value = urlParserNormalized(reference).trim();
  if (value.length === 0 || value.startsWith('#')) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith('data:')) return null;
  const normalized = percentDecoded(value).replace(/\\/g, '/');
  if (normalized.startsWith('//')) {
    return templateIssue('folder-reference-protocol-relative', at, 'a reference must not start with //');
  }
  if (SCHEME_PATTERN.test(lower) || SCHEME_PATTERN.test(normalized.toLowerCase())) {
    return templateIssue('folder-reference-scheme', at, 'a reference must not carry a scheme (only data: is allowed)');
  }
  if (normalized.startsWith('/')) return templateIssue('folder-reference-absolute', at, 'a reference must be relative');
  const pathPart = normalized.split(/[?#]/, 1)[0] ?? '';
  if (pathPart.split('/').includes('..')) {
    return templateIssue('folder-reference-parent', at, 'a reference must not contain a .. segment');
  }
  return null;
}

function firstQuotedOrBare(match: RegExpMatchArray): string {
  return match[1] ?? match[2] ?? match[3] ?? '';
}

/** Rule 3 for one attribute value: decoded, or undecodable when a character reference survives. */
function decodedAttributeValue(value: string): FoundReference {
  const decoded = decodeCharacterReferences(value);
  return UNDECODED_REFERENCE_PATTERN.test(decoded) ? { kind: 'undecodable' } : { kind: 'value', value: decoded };
}

function attributeReferences(text: string): FoundReference[] {
  const found: FoundReference[] = [];
  for (const match of text.matchAll(ATTRIBUTE_PATTERN)) {
    const name = (match[1] ?? '').toLowerCase();
    const decoded = decodedAttributeValue(match[2] ?? match[3] ?? match[4] ?? '');
    if (decoded.kind === 'undecodable') {
      found.push(decoded);
    } else if (name === 'srcset' || name === 'imagesrcset') {
      for (const candidate of decoded.value.split(',')) found.push({ kind: 'value', value: candidate.trim().split(/\s+/, 1)[0] ?? '' });
    } else if (name === 'ping') {
      for (const token of decoded.value.split(/\s+/)) found.push({ kind: 'value', value: token });
    } else {
      found.push(decoded);
    }
  }
  return found;
}

/* Rule 5: the URL part of `<meta http-equiv="refresh" content="0;url=…">`. */
function metaRefreshReferences(text: string): FoundReference[] {
  const found: FoundReference[] = [];
  for (const tag of text.matchAll(META_TAG_PATTERN)) {
    const httpEquiv = tag[0].match(META_HTTP_EQUIV_PATTERN);
    if (httpEquiv === null || decodeCharacterReferences(firstQuotedOrBare(httpEquiv)).trim().toLowerCase() !== 'refresh') continue;
    const contentMatch = tag[0].match(META_CONTENT_PATTERN);
    if (contentMatch === null) continue;
    const content = decodedAttributeValue(firstQuotedOrBare(contentMatch));
    if (content.kind === 'undecodable') {
      found.push(content);
      continue;
    }
    const separator = content.value.search(/[;,]/);
    if (separator < 0) continue;
    const target = content.value.slice(separator + 1).trim().replace(REFRESH_URL_PREFIX_PATTERN, '');
    const unquoted = target.length > 1 && (target[0] === '"' || target[0] === "'") ? target.slice(1).replace(/["']$/, '') : target;
    found.push({ kind: 'value', value: unquoted });
  }
  return found;
}

/* Rule 7: every quoted string that is a direct argument of `image-set(…)`, scanned without a regex. */
function imageSetReferences(text: string): string[] {
  const references: string[] = [];
  for (const match of text.matchAll(IMAGE_SET_PATTERN)) {
    let depth = 1;
    let index = (match.index ?? 0) + match[0].length;
    while (index < text.length && depth > 0) {
      const character = text[index];
      if (character === '"' || character === "'") {
        const close = text.indexOf(character, index + 1);
        if (close < 0) break;
        if (depth === 1) references.push(text.slice(index + 1, close));
        index = close + 1;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      index += 1;
    }
  }
  return references;
}

function cssReferences(text: string): string[] {
  const references: string[] = [];
  for (const match of text.matchAll(CSS_URL_PATTERN)) references.push(firstQuotedOrBare(match));
  for (const match of text.matchAll(CSS_IMPORT_PATTERN)) references.push(firstQuotedOrBare(match));
  references.push(...imageSetReferences(text));
  return references;
}

function referencesIn(text: string, extension: string): FoundReference[] {
  const asValues = (values: readonly string[]): FoundReference[] => values.map((value) => ({ kind: 'value', value }));
  const rawCss = cssReferences(text);
  if (extension !== '.html' && extension !== '.svg') return asValues(rawCss);
  // Rule 6: CSS inside markup is scanned again with character references decoded.
  const decodedText = decodeCharacterReferences(text);
  const rawSet = new Set(rawCss);
  const decodedCss = decodedText === text ? [] : cssReferences(decodedText).filter((reference) => !rawSet.has(reference));
  return [...attributeReferences(text), ...metaRefreshReferences(text), ...asValues(rawCss), ...asValues(decodedCss)];
}

function pathIssues(entry: TemplateFolderEntry): TemplateIssue[] {
  const segments = entry.path.split('/');
  if (entry.path.length === 0 || entry.path.startsWith('/') || segments.some((segment) => segment === '' || segment === '..')) {
    return [templateIssue('folder-path-invalid', entry.path, 'a file path must be relative, without empty or .. segments')];
  }
  const issues: TemplateIssue[] = [];
  if (segments.some((segment) => segment.startsWith('.'))) {
    issues.push(templateIssue('folder-hidden-segment', entry.path, 'no path segment may start with a dot'));
  }
  if (entry.type === 'symlink') issues.push(templateIssue('folder-symlink', entry.path, 'symbolic links are not allowed'));
  if (entry.type === 'other') issues.push(templateIssue('folder-not-a-file', entry.path, 'only regular files are allowed'));
  if (!ALLOWED_EXTENSIONS.has(extensionOf(entry.path))) {
    issues.push(templateIssue('folder-extension-not-allowed', entry.path, 'this file extension is not allowed'));
  }
  return issues;
}

function hasTimelineMarker(entries: readonly TemplateFolderEntry[]): boolean {
  const index = entries.find((entry) => entry.path === 'index.html');
  if (index?.text != null && /\sdata-no-timeline(?=[\s=>/])/i.test(index.text)) return true;
  return entries.some((entry) => {
    const extension = extensionOf(entry.path);
    return (extension === '.html' || extension === '.js') && entry.text?.includes('window.__timelines') === true;
  });
}

function foundReferenceIssue(found: FoundReference, at: string): TemplateIssue | null {
  if (found.kind === 'undecodable') {
    return templateIssue('folder-reference-scheme', at, 'a reference must not hold a character reference that cannot be decoded');
  }
  return referenceIssue(found.value, at);
}

/** One issue per broken folder rule of sections 4.3 and 17.7; empty for a self-contained template (AC 77, AC 94, AC 95). */
export function templateFolderIssues(entries: readonly TemplateFolderEntry[]): readonly TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  if (entries.length > hyperframesBounds.maxFiles) {
    issues.push(templateIssue('folder-too-many-files', null, `at most ${hyperframesBounds.maxFiles} files`));
  }
  if (!entries.some((entry) => entry.path === 'index.html' && entry.type === 'file')) {
    issues.push(templateIssue('folder-index-missing', 'index.html', 'index.html must exist at the folder root'));
  }
  for (const entry of entries) {
    issues.push(...pathIssues(entry));
    const extension = extensionOf(entry.path);
    if (entry.type !== 'file' || !TEXT_REQUIRED.has(extension)) continue;
    if (entry.text === null || entry.text.length > hyperframesBounds.maxTextFileBytes) {
      issues.push(templateIssue('folder-text-unreadable', entry.path, 'the file text could not be checked'));
      continue;
    }
    if (!TEXT_SCANNED.has(extension)) continue;
    for (const found of referencesIn(entry.text, extension)) {
      const issue = foundReferenceIssue(found, entry.path);
      if (issue !== null) issues.push(issue);
    }
  }
  if (!hasTimelineMarker(entries)) {
    issues.push(
      templateIssue('folder-timeline-marker-missing', 'index.html', 'index.html needs data-no-timeline, or a file must define window.__timelines'),
    );
  }
  return issues;
}
