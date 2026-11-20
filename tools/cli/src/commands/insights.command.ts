import { GetStudioInsightsQuery } from '@studio/core/insights';
import { type InsightsView } from '@studio/shared/api';
import { ExitCode } from '../errors/exit-codes.js';
import { insightsLines } from '../insights/insights-text.js';
import { withCliContext } from '../nest/cli-context.js';
import type { CommandDependencies } from './command-dependencies.js';

export interface InsightsOptions {
  /** Prints the C10 `InsightsView` as JSON instead of the pt-BR text. */
  json: boolean;
}

/** Where the command reads the view from; the Nest-backed one by default, a fake in tests. */
export type InsightsSource = () => Promise<InsightsView>;

export const nestInsightsSource: InsightsSource = () => withCliContext((context) => context.queryBus.execute(new GetStudioInsightsQuery(new Date())));

/**
 * `studio insights [--json]` (PRD 0001 R4 goal 4): the section 14 success metrics from the same
 * core query as `GET /insights`. Read-only.
 */
export async function insightsCommand(
  options: InsightsOptions,
  source: InsightsSource,
  dependencies: Pick<CommandDependencies, 'printer'>,
): Promise<number> {
  const insights = await source();
  if (options.json) {
    dependencies.printer.line(JSON.stringify(insights, null, 2));
    return ExitCode.ok;
  }
  for (const line of insightsLines(insights)) dependencies.printer.line(line);
  return ExitCode.ok;
}
