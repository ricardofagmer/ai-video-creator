import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InsightsViewSchema, type InsightsView } from '@studio/shared/api';
import { ExitCode } from '../errors/exit-codes.js';
import type { Printer } from '../output/printer.js';
import { insightsCommand } from './insights.command.js';

class CapturingPrinter implements Printer {
  readonly lines: string[] = [];

  line(text = ''): void {
    this.lines.push(text);
  }

  error(text: string): void {
    this.lines.push(`error: ${text}`);
  }
}

const insights: InsightsView = InsightsViewSchema.parse({
  computedAt: '2026-11-19T12:00:00.000Z',
  runsRead: 12,
  truncated: false,
  reviewReach: { reachedReview: 10, withoutRepair: 9, share: 0.9, withoutHistory: 2 },
  reviewTime: [{ recipeId: 'product-tour', runs: 3, firstRunMs: 5 * 3_600_000, latestRunMs: 3 * 3_600_000, faster: true }],
  catalogShare: {
    latestRuns: [{ runId: '01KA0000000000000000000000', ordinal: 12, assetVersions: 5, fromCatalog: 4, share: 0.8 }],
    fromTargetRun: 3,
    meetingTarget: 2,
    withoutManifest: 0,
  },
  cost: { approvedRuns: 2, approvedCostUsd: 6, costPerApprovedUsd: 3, runsOverRunLimit: 1, runLimitUsd: 3, monthToDateUsd: null, monthLimitUsd: 60 },
  ratingTrend: [{ recipeId: 'product-tour', latestMean: 3.6, latestCount: 5, previousMean: 3, previousCount: 5, holding: true }],
  unapprovedPublications: 0,
});

describe('studio insights', () => {
  it('prints one pt-BR block per section 14 metric', async () => {
    const printer = new CapturingPrinter();

    assert.equal(await insightsCommand({ json: false }, async () => insights, { printer }), ExitCode.ok);

    const text = printer.lines.join('\n');
    assert.match(text, /Revisão sem reparo manual: 90% \(9 de 10\) · meta 90% · na meta/);
    assert.match(text, /2 sem histórico legível ficaram de fora/);
    assert.match(text, /product-tour: 5 h 0 min -> 3 h 0 min \(3 execuções\) · na meta/);
    assert.match(text, /Ativos do catálogo: 2 de 3 execuções a partir da 10ª com 80% ou mais · fora da meta/);
    assert.match(text, /mês atual indisponível de \$60\.00/);
    assert.match(text, /product-tour: 3,6 \(5\) contra 3,0 \(5\) · na meta/);
    assert.match(text, /Publicados sem aprovação: 0 · meta nenhum · na meta/);
  });

  it('prints the view as JSON with --json', async () => {
    const printer = new CapturingPrinter();

    await insightsCommand({ json: true }, async () => insights, { printer });

    assert.deepEqual(InsightsViewSchema.parse(JSON.parse(printer.lines.join('\n'))), insights);
  });
});
