import { type DataHomePaths } from './data-home-paths';
import { readHeartbeatInput } from './heartbeat-input';
import { readServicePidRecord } from './pid-record';
import { ReviewCounter } from './review-summary';
import { readScheduleSummary } from './schedule-summary';
import { type FastInputs, type SlowInputs } from './state-model';

/** Heartbeat and both pid records, read concurrently; each reader maps its own failures to a state. */
export async function readFastInputs(paths: DataHomePaths): Promise<FastInputs> {
  const [heartbeat, api, web] = await Promise.all([
    readHeartbeatInput(paths.logs),
    readServicePidRecord(paths.logs, 'api'),
    readServicePidRecord(paths.logs, 'web'),
  ]);
  return { heartbeat, api, web };
}

/** Schedules and runs; the counter is kept across calls so unchanged run files are not parsed again. */
export function slowInputsReader(paths: DataHomePaths): (nowMs: number) => Promise<SlowInputs> {
  const reviewCounter = new ReviewCounter(paths.runs);
  return async (nowMs) => {
    const [schedules, reviews] = await Promise.all([readScheduleSummary(paths.schedules, nowMs), reviewCounter.count()]);
    return { schedules, reviews };
  };
}
