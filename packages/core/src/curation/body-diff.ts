import { curationBounds, type CurationDiffStats } from '@studio/shared/curation';

/** Lines of unchanged context around each change, as `diff -u` writes them. */
const CONTEXT_LINES = 3;

/**
 * Bound on the LCS table (cells). Two 16,000-character bodies of short lines could need 256 million
 * cells; past this bound the differing middle is written as one replacement, which is still a
 * correct diff, just not a minimal one.
 */
const MAX_LCS_CELLS = 4_000_000;

const TRUNCATION_LINE = '... diff truncated at 80,000 characters';

export class BodyTooLongForDiffError extends RangeError {
  constructor(readonly chars: number) {
    super(`A body of ${chars} characters exceeds the ${curationBounds.maxBodyChars}-character diff input bound`);
    this.name = 'BodyTooLongForDiffError';
  }
}

export interface BodyDiff {
  /** Unified line diff, at most 80,000 characters; empty when the bodies are equal. */
  diff: string;
  stats: CurationDiffStats;
}

type EditOperation = { type: 'same' | 'removed' | 'added'; line: string };

/**
 * The comparison form of a body (SPEC 0005 section 5.4 `body-changed`): CRLF and CR become LF and
 * trailing newlines are dropped, so a body that differs only in line endings is unchanged.
 */
export function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
}

function linesOf(body: string): string[] {
  const normalized = normalizeBody(body);
  return normalized === '' ? [] : normalized.split('\n');
}

/** Classic LCS table walk over the differing middle; `old`/`next` exclude the common prefix and suffix. */
function lcsOperations(old: readonly string[], next: readonly string[]): EditOperation[] {
  const rows = old.length;
  const columns = next.length;
  if (rows * columns > MAX_LCS_CELLS) {
    return [...old.map((line): EditOperation => ({ type: 'removed', line })), ...next.map((line): EditOperation => ({ type: 'added', line }))];
  }
  const width = columns + 1;
  const table = new Uint32Array((rows + 1) * width);
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[row * width + column] =
        old[row] === next[column]
          ? (table[(row + 1) * width + column + 1] ?? 0) + 1
          : Math.max(table[(row + 1) * width + column] ?? 0, table[row * width + column + 1] ?? 0);
    }
  }
  const operations: EditOperation[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    const oldLine = old[row] ?? '';
    const nextLine = next[column] ?? '';
    if (oldLine === nextLine) {
      operations.push({ type: 'same', line: oldLine });
      row += 1;
      column += 1;
    } else if ((table[(row + 1) * width + column] ?? 0) >= (table[row * width + column + 1] ?? 0)) {
      operations.push({ type: 'removed', line: oldLine });
      row += 1;
    } else {
      operations.push({ type: 'added', line: nextLine });
      column += 1;
    }
  }
  for (; row < rows; row += 1) operations.push({ type: 'removed', line: old[row] ?? '' });
  for (; column < columns; column += 1) operations.push({ type: 'added', line: next[column] ?? '' });
  return operations;
}

function editOperations(old: readonly string[], next: readonly string[]): EditOperation[] {
  let prefix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < old.length - prefix &&
    suffix < next.length - prefix &&
    old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const same = (line: string): EditOperation => ({ type: 'same', line });
  return [
    ...old.slice(0, prefix).map(same),
    ...lcsOperations(old.slice(prefix, old.length - suffix), next.slice(prefix, next.length - suffix)),
    ...old.slice(old.length - suffix).map(same),
  ];
}

interface Hunk {
  start: number;
  end: number;
}

/** Groups changed operations with their context; hunks whose context touches are merged. */
function hunksOf(operations: readonly EditOperation[]): Hunk[] {
  const hunks: Hunk[] = [];
  operations.forEach((operation, index) => {
    if (operation.type === 'same') return;
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(operations.length, index + CONTEXT_LINES + 1);
    const last = hunks.at(-1);
    if (last !== undefined && start <= last.end) last.end = Math.max(last.end, end);
    else hunks.push({ start, end });
  });
  return hunks;
}

/** `start,count` of one side of a hunk header; an empty side names the line before it. */
function range(firstLine: number, count: number): string {
  return `${count === 0 ? firstLine - 1 : firstLine},${count}`;
}

function renderHunk(operations: readonly EditOperation[], hunk: Hunk): string[] {
  let oldLine = 1;
  let newLine = 1;
  for (const operation of operations.slice(0, hunk.start)) {
    if (operation.type !== 'added') oldLine += 1;
    if (operation.type !== 'removed') newLine += 1;
  }
  const body: string[] = [];
  let oldCount = 0;
  let newCount = 0;
  for (const operation of operations.slice(hunk.start, hunk.end)) {
    if (operation.type === 'same') {
      body.push(` ${operation.line}`);
      oldCount += 1;
      newCount += 1;
    } else if (operation.type === 'removed') {
      body.push(`-${operation.line}`);
      oldCount += 1;
    } else {
      body.push(`+${operation.line}`);
      newCount += 1;
    }
  }
  return [`@@ -${range(oldLine, oldCount)} +${range(newLine, newCount)} @@`, ...body];
}

/** Cuts at a line boundary so the text plus the marker fits the 80,000-character bound. */
function capDiff(lines: readonly string[]): string {
  const full = lines.join('\n');
  if (full.length <= curationBounds.diffChars) return full;
  const room = curationBounds.diffChars - TRUNCATION_LINE.length - 1;
  const cut = full.lastIndexOf('\n', room);
  return `${full.slice(0, cut < 0 ? 0 : cut)}\n${TRUNCATION_LINE}`;
}

/**
 * SPEC 0005 section 5.4, B17: the line-based unified diff the ground check writes into
 * `proposal.json`; the model never writes it. Pure, no dependency. Inputs are capped at 16,000
 * characters (larger throws `BodyTooLongForDiffError`); the output is capped at 80,000. The stats
 * count every added and removed line, also past a truncation.
 */
export function computeBodyDiff(oldBody: string, newBody: string): BodyDiff {
  for (const body of [oldBody, newBody]) {
    if (body.length > curationBounds.maxBodyChars) throw new BodyTooLongForDiffError(body.length);
  }
  const operations = editOperations(linesOf(oldBody), linesOf(newBody));
  const stats: CurationDiffStats = {
    addedLines: operations.filter((operation) => operation.type === 'added').length,
    removedLines: operations.filter((operation) => operation.type === 'removed').length,
  };
  const hunks = hunksOf(operations);
  if (hunks.length === 0) return { diff: '', stats };
  const lines = ['--- current', '+++ proposed', ...hunks.flatMap((hunk) => renderHunk(operations, hunk))];
  return { diff: capDiff(lines), stats };
}
