import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/*
 * HyperFrames renders the whole length a composition declares and the picture is cut to the
 * narration afterwards, so a template that accepts long videos would cost its longest length on
 * every render. The staged copy (never the stored template) is therefore set to the length of
 * this run before the render reads it.
 */

const INDEX_FILE = 'index.html';
const DURATION_ATTRIBUTE = /data-duration="(\d+(?:\.\d+)?)"/;

/** Whole seconds that cover the narration; the picture must not end before the audio. */
export function compositionLengthS(narrationS: number): number {
  return Math.max(1, Math.ceil(narrationS));
}

/**
 * `indexHtml` with the composition length set to `lengthS`. The first `data-duration` is the
 * composition's own; every element declared with that same length (a full-length background clip)
 * follows it, and shorter clips keep theirs.
 */
export function fitCompositionLength(indexHtml: string, lengthS: number): string {
  const declared = DURATION_ATTRIBUTE.exec(indexHtml)?.[1];
  if (declared === undefined) return indexHtml;
  return indexHtml.replaceAll(`data-duration="${declared}"`, `data-duration="${lengthS}"`);
}

/** Rewrites the staged template's `index.html` in place; the copy is private to this render. */
export async function fitStagedCompositionLength(templateDir: string, lengthS: number): Promise<void> {
  const indexPath = join(templateDir, INDEX_FILE);
  const indexHtml = await readFile(indexPath, 'utf8');
  const fitted = fitCompositionLength(indexHtml, lengthS);
  if (fitted !== indexHtml) await writeFile(indexPath, fitted, { mode: 0o600 });
}
