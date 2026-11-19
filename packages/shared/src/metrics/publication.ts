import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, PublicationIdSchema, RunIdSchema } from '../common/ids';
import { metricsBounds, platformVideoIdPatterns } from './constants';
import { PlatformSchema } from './enums';

/**
 * One `run_publications` row (SPEC 0006 sections 4.3 and 5.1): where the owner published an
 * approved run. A record of something done elsewhere; nothing is fetched and nothing is posted.
 * `url` is the canonical `https` URL rebuilt by `parsePublicationUrl`, never the raw input.
 * Rule: `platformVideoId` matches `platformVideoIdPatterns[platform]`.
 */
export const PublicationSchema = z
  .object({
    publicationId: PublicationIdSchema,
    runId: RunIdSchema,
    platform: PlatformSchema,
    platformVideoId: z.string().max(40),
    url: z.string().max(metricsBounds.urlChars),
    /** Owner-entered `yyyy-mm-dd`, optional. */
    publishedOn: IsoDateSchema.nullable(),
    recordedBy: z.string().min(1).max(100),
    recordedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((publication, context) => {
    if (!platformVideoIdPatterns[publication.platform].test(publication.platformVideoId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['platformVideoId'],
        message: `platformVideoId does not match the ${publication.platform} id pattern`,
      });
    }
  });
export type Publication = z.infer<typeof PublicationSchema>;
