/*
 * The one issue shape every HyperFrames template check returns (SPEC 0008 sections 4.3 and 5.4).
 * `at` names the property, the file path or the field the issue is about; messages are English
 * for the api's validation error and never carry a variable value.
 */

export type TemplateIssueCode =
  // Template details (hyperframesTemplateIssues)
  | 'engine-not-hyperframes'
  | 'scene-schema-not-null'
  | 'camera-moves-not-empty'
  | 'transitions-not-empty'
  // Flat input schema (flatInputSchemaIssues)
  | 'schema-not-object'
  | 'schema-key-not-allowed'
  | 'schema-type-not-object'
  | 'schema-additional-properties'
  | 'schema-properties-missing'
  | 'schema-too-many-properties'
  | 'schema-required-invalid'
  | 'schema-required-undeclared'
  | 'property-name-invalid'
  | 'property-not-object'
  | 'property-key-not-allowed'
  | 'property-type-not-allowed'
  | 'property-max-length-invalid'
  | 'property-format-invalid'
  | 'property-enum-invalid'
  | 'property-default-invalid'
  // Template folder (templateFolderIssues)
  | 'folder-index-missing'
  | 'folder-too-many-files'
  | 'folder-path-invalid'
  | 'folder-hidden-segment'
  | 'folder-symlink'
  | 'folder-not-a-file'
  | 'folder-extension-not-allowed'
  | 'folder-text-unreadable'
  | 'folder-reference-scheme'
  | 'folder-reference-protocol-relative'
  | 'folder-reference-absolute'
  | 'folder-reference-parent'
  | 'folder-timeline-marker-missing';

export interface TemplateIssue {
  code: TemplateIssueCode;
  /** Property name, relative file path or details field; null for the whole object. */
  at: string | null;
  message: string;
}

export function templateIssue(code: TemplateIssueCode, at: string | null, message: string): TemplateIssue {
  return { code, at, message };
}
