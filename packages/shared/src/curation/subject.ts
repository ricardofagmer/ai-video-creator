import { z } from 'zod';
import { AssetRefSchema } from '../catalog/asset-kind';
import { RecipeRefSchema } from '../recipes/recipe';
import { CuratableKindSchema } from './enums';

/**
 * An asset or recipe version ref. Both share the `<id>@<version>` shape (SPEC 0005 L7), so the
 * union cannot tell them apart; `kind` is always carried beside it.
 */
export const CuratableRefSchema = z.union([AssetRefSchema, RecipeRefSchema]);
export type CuratableRef = z.infer<typeof CuratableRefSchema>;

/** The version a curation proposes for (SPEC 0005 section 4.3). */
export const CurationSubjectSchema = z
  .object({
    kind: CuratableKindSchema,
    ref: CuratableRefSchema,
  })
  .strict();
export type CurationSubject = z.infer<typeof CurationSubjectSchema>;
