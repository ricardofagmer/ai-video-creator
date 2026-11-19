/**
 * Metrics protocol (SPEC 0006 sections 4.2, 4.3, 5.1 to 5.4, `@studio/shared/metrics`): constants,
 * enums, zod schemas and pure functions only, browser-safe. Nothing here imports a Node module or
 * makes a request; a published URL is parsed, never fetched.
 */
export * from './cell-parsers';
export * from './constants';
export * from './csv-reader';
export * from './csv-safe-cell';
export * from './enums';
export * from './platform-signal';
export * from './provisional-column-aliases';
export * from './publication';
export * from './publication-url';
export * from './snapshot';
export {
  IsoDateSchema,
  MetricImportIdSchema,
  PublicationIdSchema,
  type IsoDate,
  type MetricImportId,
  type PublicationId,
} from '../common/ids';
