import { type TemplateDetails } from '../catalog/kind-details';
import { flatInputSchemaIssues } from './flat-input-schema';
import { templateIssue, type TemplateIssue } from './template-issues';

/**
 * The details rules of a HyperFrames template (SPEC 0008 section 4.3): the engine is
 * `hyperframes`, there is no scene list, no camera move or transition, and the input schema is
 * flat. Empty when every rule holds. Kept out of `TemplateDetailsSchema` (K13).
 */
export function hyperframesTemplateIssues(details: TemplateDetails): readonly TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  if (details.engine !== 'hyperframes') {
    issues.push(templateIssue('engine-not-hyperframes', 'engine', 'engine must be "hyperframes"'));
  }
  if (details.sceneSchema !== null) {
    issues.push(templateIssue('scene-schema-not-null', 'sceneSchema', 'a HyperFrames template has no scene list'));
  }
  if (details.cameraMoves.length > 0) {
    issues.push(templateIssue('camera-moves-not-empty', 'cameraMoves', 'a HyperFrames template declares no camera moves'));
  }
  if (details.transitions.length > 0) {
    issues.push(templateIssue('transitions-not-empty', 'transitions', 'a HyperFrames template declares no transitions'));
  }
  issues.push(...flatInputSchemaIssues(details.inputSchema));
  return issues;
}
