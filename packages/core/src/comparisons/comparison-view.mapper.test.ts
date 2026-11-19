import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ComparisonArmViewSchema } from '@studio/shared/api';
import { toComparedVersionScore } from './comparison-view.mapper';

/*
 * `comparedVersionScore` of a comparison arm (SPEC 0006 section 4.4, R3-AC-07): the compared asset
 * version's score always travels with both sample sizes, the run count and the platform count, and
 * the result satisfies the rev 5 `comparedVersionScore` schema. Pure mapper on literal versions: no
 * QueryBus, no run folders, no SQLite.
 */

const ComparedVersionScoreSchema = ComparisonArmViewSchema.shape.comparedVersionScore;

describe('compared version score', () => {
  it('carries the platform sample size next to the run sample size', () => {
    const score = toComparedVersionScore({ qualityScore: 3.8, qualitySampleSize: 4, qualityPlatformSampleSize: 1 });

    assert.deepEqual(score, { qualityScore: 3.8, qualitySampleSize: 4, qualityPlatformSampleSize: 1 });
    assert.equal(ComparedVersionScoreSchema.safeParse(score).success, true);
  });

  it('keeps an unscored version honest: no score, both counts 0', () => {
    const score = toComparedVersionScore({ qualityScore: null, qualitySampleSize: 0, qualityPlatformSampleSize: 0 });

    assert.equal(score.qualityScore, null);
    assert.equal(score.qualitySampleSize, 0);
    assert.equal(score.qualityPlatformSampleSize, 0);
    assert.equal(ComparedVersionScoreSchema.safeParse(score).success, true);
  });

  it('copies only the score columns, so the strict schema accepts it', () => {
    const version = { qualityScore: 4.5, qualitySampleSize: 6, qualityPlatformSampleSize: 6, notes: 'not part of the score' };

    assert.deepEqual(Object.keys(toComparedVersionScore(version)).sort(), ['qualityPlatformSampleSize', 'qualityScore', 'qualitySampleSize']);
  });
});
