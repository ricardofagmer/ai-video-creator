export interface RankedRow {
  readonly rowId: number;
  readonly similarity: number;
}

/**
 * Keeps the `limit` highest similarities of a brute-force scan (ADR 0004 decision 2), highest
 * first; ties go to the newer row (higher id). No threshold (B10).
 */
export class TopSimilarities {
  private readonly ranked: RankedRow[] = [];

  constructor(private readonly limit: number) {}

  offer(candidate: RankedRow): void {
    const worst = this.ranked.at(-1);
    if (this.ranked.length >= this.limit && worst !== undefined && !ranksAbove(candidate, worst)) return;
    const position = this.ranked.findIndex((row) => ranksAbove(candidate, row));
    this.ranked.splice(position === -1 ? this.ranked.length : position, 0, candidate);
    if (this.ranked.length > this.limit) this.ranked.pop();
  }

  results(): readonly RankedRow[] {
    return this.ranked;
  }
}

function ranksAbove(left: RankedRow, right: RankedRow): boolean {
  return left.similarity > right.similarity || (left.similarity === right.similarity && left.rowId > right.rowId);
}
