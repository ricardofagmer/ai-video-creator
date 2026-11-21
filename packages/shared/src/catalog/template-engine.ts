import { z } from 'zod';

/**
 * The render engine of a `template` asset (SPEC 0008 section 4.1). The two values are the ones
 * `TemplateDetailsSchema.engine` always had, so no stored row changes meaning. Remotion stays the
 * default (PRD 0001 R4 goal 5): a template saved without an explicit choice is a Remotion one.
 */
export const TemplateEngineSchema = z.enum(['remotion', 'hyperframes']);
export type TemplateEngine = z.infer<typeof TemplateEngineSchema>;

export const DEFAULT_TEMPLATE_ENGINE: TemplateEngine = 'remotion';
