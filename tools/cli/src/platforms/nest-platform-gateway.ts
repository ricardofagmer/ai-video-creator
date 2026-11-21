import { IngestMetricBatchCommand } from '@studio/core/metrics';
import {
  DisconnectCommand,
  GetPlatformsQuery,
  GetRunPublishQuery,
  RequestPublishCommand,
  SetPlatformGateCommand,
  SyncPublishAttemptsCommand,
  type PublishSyncSummary,
} from '@studio/core/platforms';
import { type PlatformsView } from '@studio/shared/api';
import { withCliContext, type CliContext } from '../nest/cli-context.js';
import { type PlatformGateway } from './platform-gateway.js';

/**
 * Who a CLI action is recorded as (`updatedBy`, `requestedBy`). The CLI has no web session; `cli`
 * is the actor name the CLI already records on runs and imports, never a person's name.
 */
const CLI_ACTOR = 'cli';

/** The platforms read inside an already booted context (`doctor` shares its context). */
export function readPlatforms(context: CliContext): Promise<PlatformsView> {
  return context.queryBus.execute(new GetPlatformsQuery());
}

/** Every open attempt's `state.json` copied into its row (section 5.4 "Result"), inside a booted context. */
export function syncAllAttempts(context: CliContext): Promise<PublishSyncSummary> {
  return context.commandBus.execute(new SyncPublishAttemptsCommand(null));
}

/** The platform port backed by the core handlers in the CLI's Nest context; no correlation id from the CLI. */
export const nestPlatformGateway: PlatformGateway = {
  list: () => withCliContext(readPlatforms),
  setGate: (platform, change) =>
    withCliContext((context) =>
      context.commandBus.execute(new SetPlatformGateCommand({ platform, change, updatedBy: CLI_ACTOR, correlationId: null })),
    ),
  disconnect: (platform) => withCliContext((context) => context.commandBus.execute(new DisconnectCommand({ platform, correlationId: null }))),
  syncMetrics: () =>
    withCliContext((context) => context.commandBus.execute(new IngestMetricBatchCommand({ batchId: null, correlationId: null }))),
  syncAttempts: () => withCliContext(syncAllAttempts),
  runPublish: (runId) =>
    withCliContext(async (context) => {
      await context.commandBus.execute(new SyncPublishAttemptsCommand(runId));
      return context.queryBus.execute(new GetRunPublishQuery(runId));
    }),
  requestPublish: (submission) =>
    withCliContext((context) =>
      context.commandBus.execute(
        new RequestPublishCommand({
          runId: submission.runId,
          platform: submission.platform,
          request: submission.request,
          requestedBy: CLI_ACTOR,
          createdBy: 'cli',
          correlationId: null,
        }),
      ),
    ),
};
