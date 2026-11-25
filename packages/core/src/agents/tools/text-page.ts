import { escapeDelimiterTags, wrapDelimited, type DelimiterTag } from '@studio/shared/agents';

export interface TextPageRequest {
  readonly tag: DelimiterTag;
  readonly attributes: Readonly<Record<string, string>>;
  /** Already redacted; it is untrusted data either way. */
  readonly text: string;
  readonly offset: number;
  readonly maxChars: number;
}

export interface TextPage {
  /** One delimited block whose body holds at most `maxChars` characters. */
  readonly block: string;
  /** `_pagination` note, or null when the page reaches the end of the text. */
  readonly pagination: string | null;
}

/**
 * Pages untrusted text into one delimited block (topology sections 3.2 and 8). Protocol tags are
 * escaped in the whole text before slicing, so a page boundary can neither create nor split a tag;
 * offsets count characters of that escaped text. Overflow is always announced in `_pagination`,
 * never cut silently.
 */
export function delimitedTextPage(request: TextPageRequest): TextPage {
  const escaped = escapeDelimiterTags(request.text);
  const total = escaped.length;
  if (request.offset > 0 && request.offset >= total) {
    return {
      block: wrapDelimited(request.tag, '', request.attributes),
      pagination: `offset ${request.offset} is past the end; the text has ${total} characters`,
    };
  }
  const end = Math.min(total, request.offset + request.maxChars);
  const body = escaped.slice(request.offset, end);
  return {
    block: wrapDelimited(request.tag, body, request.attributes),
    pagination: end < total ? `characters ${request.offset}-${end - 1} of ${total}; pass offset=${end}` : null,
  };
}

/** The offset a `_pagination` note of `delimitedTextPage` asks for, or null when it asks for none. */
export function nextOffsetOf(pagination: string | undefined): number | null {
  const match = pagination === undefined ? null : /pass offset=(\d+)$/.exec(pagination);
  return match?.[1] === undefined ? null : Number.parseInt(match[1], 10);
}
