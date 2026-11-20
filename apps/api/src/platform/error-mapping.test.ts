import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MetricImportRefusedError,
  MetricsError,
  MetricsRowCorruptError,
  PublicationRunNotApprovedError,
  PublicationUrlRefusedError,
  type MetricsErrorCategory,
} from '@studio/core/metrics';
import {
  ScheduleError,
  ScheduleEstimateChangedError,
  ScheduleFileCorruptError,
  ScheduleLimitReachedError,
  ScheduleNotFoundError,
  type ScheduleErrorCategory,
  type ScheduleErrorReason,
} from '@studio/core/schedules';
import { apiRev5ErrorReasons, type ApiRev5ErrorReason } from '@studio/shared/api';
import { MetricsFileTooLargeError } from './api.errors';
import { mapError } from './error-mapping';

const SCHEDULE_ID = '01JD0000000000000000000000';
const RUN_ID = '01JD0000000000000000000001';

function isRev5Reason(value: string): value is ApiRev5ErrorReason {
  return Object.hasOwn(apiRev5ErrorReasons, value);
}

function isScheduleReason(reason: ApiRev5ErrorReason): reason is Extract<ApiRev5ErrorReason, ScheduleErrorReason> {
  return reason.startsWith('schedule-') || reason === 'invalid-schedule-input';
}

const rev5Reasons: ApiRev5ErrorReason[] = Object.keys(apiRev5ErrorReasons).filter(isRev5Reason);

/** A metrics error whose category deliberately disagrees with the table, so only the table can give the status. */
class AnyMetricsError extends MetricsError {
  override readonly category: MetricsErrorCategory = 'conflict';

  constructor(override readonly reason: ApiRev5ErrorReason) {
    super('metrics refusal');
    this.name = 'AnyMetricsError';
  }
}

class AnyScheduleError extends ScheduleError {
  override readonly category: ScheduleErrorCategory = 'conflict';

  constructor(override readonly reason: Extract<ApiRev5ErrorReason, ScheduleErrorReason>) {
    super('schedule refusal');
    this.name = 'AnyScheduleError';
  }
}

describe('C10 rev 5 reason-to-status mapping (SPEC 0006 section 4.4)', () => {
  it('covers all 25 reasons of the frozen table', () => {
    assert.equal(rev5Reasons.length, 25);
  });

  for (const reason of rev5Reasons) {
    it(`maps ${reason} to ${apiRev5ErrorReasons[reason]}`, () => {
      const error = isScheduleReason(reason) ? new AnyScheduleError(reason) : new AnyMetricsError(reason);
      const mapped = mapError(error);
      assert.equal(mapped.statusCode, apiRev5ErrorReasons[reason]);
      assert.equal(mapped.reason, reason);
      if (mapped.statusCode >= 500) {
        assert.equal(mapped.code, 'internal');
        assert.equal(mapped.message, 'Internal error');
        assert.equal(mapped.expected, false);
      } else {
        assert.equal(mapped.expected, true);
      }
    });
  }

  it('maps the real core errors with their reasons and statuses', () => {
    const cases: [Error, string, number][] = [
      [new PublicationRunNotApprovedError(RUN_ID), 'publication-run-not-approved', 409],
      [new PublicationUrlRefusedError('publication-short-link-refused'), 'publication-short-link-refused', 422],
      [new MetricImportRefusedError('file-too-large', 'youtube'), 'metrics-file-too-large', 413],
      [new MetricImportRefusedError('not-utf8', 'instagram'), 'metrics-not-csv', 422],
      [new MetricImportRefusedError('too-many-columns', 'tiktok'), 'metrics-not-csv', 422],
      [new MetricsRowCorruptError('run_publications', RUN_ID), 'metrics-row-corrupt', 500],
      [new ScheduleEstimateChangedError(2.5, 3), 'schedule-estimate-changed', 409],
      [new ScheduleLimitReachedError(10), 'schedule-limit-reached', 422],
      [new ScheduleNotFoundError(SCHEDULE_ID), 'schedule-not-found', 404],
      [new ScheduleFileCorruptError(SCHEDULE_ID, 'schedule.json'), 'schedule-file-corrupt', 500],
    ];
    for (const [error, reason, statusCode] of cases) {
      const mapped = mapError(error);
      assert.equal(mapped.reason, reason, error.name);
      assert.equal(mapped.statusCode, statusCode, error.name);
    }
  });

  it('never sends the message of a 500, which may describe storage', () => {
    const mapped = mapError(new ScheduleFileCorruptError(SCHEDULE_ID, 'slots.jsonl'));
    assert.equal(mapped.message, 'Internal error');
    assert.doesNotMatch(mapped.message, /slots/);
  });

  it('answers the api receive refusal 413 metrics-file-too-large', () => {
    const mapped = mapError(new MetricsFileTooLargeError());
    assert.equal(mapped.statusCode, 413);
    assert.equal(mapped.reason, 'metrics-file-too-large');
    assert.equal(mapped.code, 'validation');
  });
});
