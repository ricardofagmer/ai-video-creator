import { join } from 'node:path';

/** The data-home folders the shell reads; it writes in none of them (ADR 0005, consequences). */
export interface DataHomePaths {
  readonly logs: string;
  readonly schedules: string;
  readonly runs: string;
}

export function dataHomePaths(dataHome: string): DataHomePaths {
  return {
    logs: join(dataHome, 'logs'),
    schedules: join(dataHome, 'schedules'),
    runs: join(dataHome, 'runs'),
  };
}
