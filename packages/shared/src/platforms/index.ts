/**
 * Platform protocol (SPEC 0007 sections 4.2, 4.3, 5.3 to 5.5, `@studio/shared/platforms`): enums,
 * constants, file schemas and the pure functions `pollDue`, `capabilityStatus`, `applyGateChange`
 * and the publish-state transitions. Browser-safe: nothing here imports a Node module, reads a
 * file, reads a secret or makes a request. The Node-only file helpers are
 * `@studio/shared/platforms/files`. No schema here carries a token, a code, a `state`, a verifier
 * or a client secret (K3).
 */
export * from './capability-status';
export * from './connection-files';
export * from './constants';
export * from './enums';
export * from './poll-due';
export * from './poll-files';
export * from './publish-files';
export * from './publish-state';
export { PlatformSchema, PublicationOriginSchema, type Platform, type PublicationOrigin } from '../metrics/enums';
export {
  ConnectionIdSchema,
  MetricBatchIdSchema,
  PublishAttemptIdSchema,
  type ConnectionId,
  type MetricBatchId,
  type PublishAttemptId,
} from '../common/ids';
export { RunPublicationLineSchema, type RunPublicationLine } from '../run-format/publications';
