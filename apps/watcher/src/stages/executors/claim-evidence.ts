import { type ClaimRecord, type EvidenceSpan } from '../shared/stage-artifacts';

/** Share of a claim's content words one window of page text must contain to count as evidence. */
const MIN_COVERAGE = 0.6;
/** Words shorter than this are function words in pt-BR and en-US and do not count. */
const MIN_CONTENT_WORD_LENGTH = 4;
const WINDOW_FACTOR = 3;
const EXCERPT_MAX_CHARS = 600;

interface Token {
  word: string;
  start: number;
  end: number;
}

function normalize(word: string): string {
  return word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function tokenize(text: string): Token[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    word: normalize(match[0]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function contentWords(statement: string): string[] {
  const words = tokenize(statement).map((token) => token.word);
  const content = words.filter((word) => word.length >= MIN_CONTENT_WORD_LENGTH);
  return [...new Set(content.length > 0 ? content : words)];
}

/**
 * Finds the span of page text that best supports one statement: a window of page words that
 * contains at least 60% of the statement's content words (accents and case ignored). Returns null
 * when no window reaches that share, so a claim never gets evidence from scattered words.
 */
function findEvidence(statement: string, pageText: string): EvidenceSpan | null {
  const wanted = contentWords(statement);
  if (wanted.length === 0) return null;
  const page = tokenize(pageText);
  const windowSize = Math.max(wanted.length * WINDOW_FACTOR, wanted.length + 2);
  const required = Math.max(1, Math.ceil(wanted.length * MIN_COVERAGE));
  let best: { covered: number; first: Token; last: Token } | null = null;
  for (let start = 0; start < page.length; start += 1) {
    const window = page.slice(start, start + windowSize);
    const matched = window.filter((token) => wanted.includes(token.word));
    const covered = new Set(matched.map((token) => token.word)).size;
    const first = matched[0];
    const last = matched.at(-1);
    if (first === undefined || last === undefined || covered < required) continue;
    if (best === null || covered > best.covered) best = { covered, first, last };
    if (covered === wanted.length) break;
  }
  if (best === null) return null;
  return { start: best.first.start, end: best.last.end, excerpt: pageText.slice(best.first.start, best.last.end).slice(0, EXCERPT_MAX_CHARS) };
}

/** One claim per key message, in brief order (`claim-1`, `claim-2`, ...). */
export function claimsFromKeyMessages(keyMessages: readonly string[], pageText: string): ClaimRecord[] {
  return keyMessages.map((statement, index) => {
    const evidence = findEvidence(statement, pageText);
    return {
      claimId: `claim-${index + 1}`,
      statement,
      status: evidence === null ? 'unverified' : 'verified',
      evidence,
      evidenceRef: evidence === null ? null : `research:${evidence.start}-${evidence.end}`,
    };
  });
}

/** Marks a claim the owner stated in the brief of a run with no source: there is no page to check it against. */
export const OWNER_STATED_REF_PREFIX = 'owner:key-message-';

/**
 * Key messages of a run with no Source URL (owner decision, 2026-11-24): each is the owner's own
 * statement, so it passes with the statement as its excerpt and an `owner:` reference instead of a
 * page span. A run with a source never uses this; its messages need a span of the page text.
 */
export function claimsStatedByOwner(keyMessages: readonly string[]): ClaimRecord[] {
  return keyMessages.map((statement, index) => ({
    claimId: `claim-${index + 1}`,
    statement,
    status: 'verified',
    evidence: { start: 0, end: 0, excerpt: statement },
    evidenceRef: `${OWNER_STATED_REF_PREFIX}${index + 1}`,
  }));
}

/**
 * Site analysis key points the page text backs (spec Amendment): only a point with an evidence
 * span becomes a claim, numbered after the key-message claims; a point with no span is dropped, so
 * the analyst's reading never enters the script as an unverified fact.
 */
export function claimsFromKeyPoints(keyPoints: readonly string[], pageText: string, firstNumber: number): ClaimRecord[] {
  const claims: ClaimRecord[] = [];
  for (const statement of keyPoints) {
    const evidence = findEvidence(statement, pageText);
    if (evidence === null) continue;
    claims.push({
      claimId: `claim-${firstNumber + claims.length}`,
      statement,
      status: 'verified',
      evidence,
      evidenceRef: `research:${evidence.start}-${evidence.end}`,
    });
  }
  return claims;
}
