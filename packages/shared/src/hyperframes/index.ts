/**
 * HyperFrames protocol (SPEC 0008 sections 4.2 to 4.5 and 5.3, `@studio/shared/hyperframes`):
 * constants, the three file schemas of `<data home>/hyperframes/`, the template checks
 * `flatInputSchemaIssues`, `templateFolderIssues` and `hyperframesTemplateIssues`, `engineState`,
 * `hyperframesPaths` and the variable resolution rule. Browser-safe: nothing here imports a Node
 * module, reads a file, starts a process or makes a request. The Node-only file helpers are
 * `@studio/shared/hyperframes/files`.
 */
export * from './constants';
export * from './engine-files';
export * from './engine-state';
export * from './flat-input-schema';
export * from './paths';
export * from './template-details';
export * from './template-folder';
export * from './template-issues';
export * from './template-variables';
export { DEFAULT_TEMPLATE_ENGINE, TemplateEngineSchema, type TemplateEngine } from '../catalog/template-engine';
