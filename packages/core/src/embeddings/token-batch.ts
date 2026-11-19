import { EmbeddingOutputInvalidError } from './embeddings.errors';

/**
 * Up to 8 token sequences padded to one length (B9), as the row-major int64 inputs a
 * BERT-family ONNX encoder takes. `attentionMask` is 1 on real tokens and 0 on padding; every
 * `tokenTypeIds` entry is 0 (single-segment input).
 */
export interface TokenBatch {
  readonly batchSize: number;
  readonly sequenceLength: number;
  readonly inputIds: BigInt64Array;
  readonly attentionMask: BigInt64Array;
  readonly tokenTypeIds: BigInt64Array;
}

export function buildTokenBatch(sequences: readonly (readonly number[])[], padTokenId: number): TokenBatch {
  const batchSize = sequences.length;
  const sequenceLength = sequences.reduce((longest, ids) => Math.max(longest, ids.length), 0);
  const size = batchSize * sequenceLength;
  const inputIds = new BigInt64Array(size).fill(BigInt(padTokenId));
  const attentionMask = new BigInt64Array(size);
  sequences.forEach((ids, row) => {
    ids.forEach((id, column) => {
      inputIds[row * sequenceLength + column] = BigInt(id);
      attentionMask[row * sequenceLength + column] = 1n;
    });
  });
  return { batchSize, sequenceLength, inputIds, attentionMask, tokenTypeIds: new BigInt64Array(size) };
}

/**
 * Mean pooling over the attention mask, then L2 normalization: the sentence-embedding recipe of
 * the e5 family (docs/vetting/0001 section 6). `hidden` is the encoder's `[batch, sequence,
 * dimensions]` output, row-major. Core's runtime checks and normalizes the result again
 * (`toUnitVector`), so a zero vector here is left for it to refuse.
 */
export function meanPoolAndNormalize(hidden: Float32Array, batch: TokenBatch, dimensions: number): Float32Array[] {
  if (hidden.length !== batch.batchSize * batch.sequenceLength * dimensions) throw new EmbeddingOutputInvalidError('dimensions');
  const vectors: Float32Array[] = [];
  for (let row = 0; row < batch.batchSize; row += 1) {
    const sum = new Float32Array(dimensions);
    let tokens = 0;
    for (let column = 0; column < batch.sequenceLength; column += 1) {
      const position = row * batch.sequenceLength + column;
      if (batch.attentionMask[position] !== 1n) continue;
      tokens += 1;
      const offset = position * dimensions;
      for (let dimension = 0; dimension < dimensions; dimension += 1) sum[dimension] = (sum[dimension] ?? 0) + (hidden[offset + dimension] ?? 0);
    }
    if (tokens === 0) throw new EmbeddingOutputInvalidError('zero-vector');
    let squaredNorm = 0;
    for (let dimension = 0; dimension < dimensions; dimension += 1) {
      const mean = (sum[dimension] ?? 0) / tokens;
      sum[dimension] = mean;
      squaredNorm += mean * mean;
    }
    const norm = Math.sqrt(squaredNorm);
    if (norm > 0) for (let dimension = 0; dimension < dimensions; dimension += 1) sum[dimension] = (sum[dimension] ?? 0) / norm;
    vectors.push(sum);
  }
  return vectors;
}
