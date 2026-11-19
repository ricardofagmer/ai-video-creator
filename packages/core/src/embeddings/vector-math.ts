import { EmbeddingOutputInvalidError } from './embeddings.errors';

/**
 * Checks one runtime output and returns it unit-normalized, so cosine similarity is a dot product
 * (ADR 0004 decision 2). A wrong size, a non-finite value or a zero vector is refused.
 */
export function toUnitVector(vector: Float32Array, dimensions: number): Float32Array {
  if (vector.length !== dimensions) throw new EmbeddingOutputInvalidError('dimensions');
  let squaredNorm = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new EmbeddingOutputInvalidError('not-finite');
    squaredNorm += value * value;
  }
  if (squaredNorm === 0) throw new EmbeddingOutputInvalidError('zero-vector');
  const norm = Math.sqrt(squaredNorm);
  return Float32Array.from(vector, (value) => value / norm);
}

/** Both vectors are unit-normalized and of one model, so this is their cosine, clamped to [-1, 1]. */
export function cosineOfUnitVectors(left: Float32Array, right: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += (left[index] ?? 0) * (right[index] ?? 0);
  return Math.max(-1, Math.min(1, sum));
}

/** `embedding_json`: a JSON array of numbers (C8). */
export function serializeVector(vector: Float32Array): string {
  return JSON.stringify(Array.from(vector));
}

/**
 * Parses a stored vector. Null when the text is not a JSON array of `dimensions` finite numbers:
 * the row is then treated as having no current vector (counted in `pending`), never scored.
 */
export function parseStoredVector(text: string, dimensions: number): Float32Array | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A corrupt cell is reported as "no vector"; the next `sync --all` rewrites it.
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== dimensions) return null;
  const vector = new Float32Array(dimensions);
  for (let index = 0; index < dimensions; index += 1) {
    const value: unknown = parsed[index];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    vector[index] = value;
  }
  return vector;
}
