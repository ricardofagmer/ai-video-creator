import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type PromotionApproval as PromotionApprovalRow } from '@prisma/client';
import {
  assetApprovalScores,
  RECIPE_APPROVAL_SCORES,
  toApprovalCreateData,
  toPromotionApprovalView,
  type ApprovalScores,
  type NewPromotionApproval,
} from './promotion-approval.mapper';

/*
 * The approval's frozen score facts (SPEC 0006 section 4.4, R3-AC-07): promoting an asset version
 * records its platform sample size next to the run sample size, the insert data carries it, and the
 * `PromotionApprovalView` returns it; an approval recorded before the R3 migration (column NULL)
 * maps to `null`, never to 0. Pure mapper functions on literal rows: no Prisma, no SQLite.
 */

const DECIDED_AT = new Date('2026-11-19T12:00:00.000Z');

function newApproval(target: NewPromotionApproval['target'], scores: ApprovalScores): NewPromotionApproval {
  return {
    target,
    versionRowId: 7,
    decidedBy: 'owner',
    decidedAt: DECIDED_AT,
    reason: 'better hook retention',
    evidence: { comparisonId: null, runIds: [] },
    replacedVersion: 1,
    correlationId: null,
    ...scores,
  };
}

/** A stored `promotion_approvals` row as Prisma returns it. */
function storedRow(overrides: Partial<PromotionApprovalRow>): PromotionApprovalRow {
  return {
    id: 42,
    targetKind: 'asset-version',
    assetVersionId: 7,
    recipeVersionId: null,
    decidedBy: 'owner',
    decidedAt: DECIDED_AT,
    reason: 'better hook retention',
    evidenceJson: JSON.stringify({ comparisonId: null, runIds: [] }),
    replacedVersion: 1,
    qualityScoreAtApproval: 4.2,
    sampleSizeAtApproval: 5,
    platformSampleSizeAtApproval: 3,
    correlationId: null,
    ...overrides,
  };
}

describe('asset-version approval scores', () => {
  it('records both sample sizes of the version next to its score', () => {
    const scores = assetApprovalScores({ qualityScore: 4.2, qualitySampleSize: 5, qualityPlatformSampleSize: 3 });

    assert.deepEqual(scores, { qualityScoreAtApproval: 4.2, sampleSizeAtApproval: 5, platformSampleSizeAtApproval: 3 });
  });

  it('records a real zero platform count as 0, not as null', () => {
    const scores = assetApprovalScores({ qualityScore: 3, qualitySampleSize: 2, qualityPlatformSampleSize: 0 });

    assert.equal(scores.platformSampleSizeAtApproval, 0);
  });

  it('writes the platform figure into the insert data and returns it in the view', () => {
    const data = toApprovalCreateData(
      newApproval('asset-version', assetApprovalScores({ qualityScore: 4.2, qualitySampleSize: 5, qualityPlatformSampleSize: 3 })),
    );
    assert.equal(data.platformSampleSizeAtApproval, 3);
    assert.equal(data.sampleSizeAtApproval, 5);
    assert.equal(data.assetVersionId, 7);
    assert.equal(data.recipeVersionId, null);

    const view = toPromotionApprovalView(
      storedRow({
        qualityScoreAtApproval: data.qualityScoreAtApproval ?? null,
        sampleSizeAtApproval: data.sampleSizeAtApproval ?? 0,
        platformSampleSizeAtApproval: data.platformSampleSizeAtApproval ?? null,
      }),
    );

    assert.equal(view.qualityScoreAtApproval, 4.2);
    assert.equal(view.sampleSizeAtApproval, 5);
    assert.equal(view.platformSampleSizeAtApproval, 3);
  });
});

describe('recipe-version approval scores', () => {
  it('records no score, a run count of 0 and no platform figure', () => {
    const data = toApprovalCreateData(newApproval('recipe-version', RECIPE_APPROVAL_SCORES));

    assert.equal(data.qualityScoreAtApproval, null);
    assert.equal(data.sampleSizeAtApproval, 0);
    assert.equal(data.platformSampleSizeAtApproval, null);
    assert.equal(data.recipeVersionId, 7);
    assert.equal(data.assetVersionId, null);
  });
});

describe('legacy approvals', () => {
  it('maps a row recorded before the platform column existed to null', () => {
    const view = toPromotionApprovalView(storedRow({ platformSampleSizeAtApproval: null }));

    assert.equal(view.platformSampleSizeAtApproval, null);
    assert.equal(view.sampleSizeAtApproval, 5);
  });
});
