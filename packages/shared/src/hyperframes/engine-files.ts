import { z } from 'zod';
import { AbsolutePathSchema, IsoDateTimeSchema, Sha256Schema } from '../common/ids';
import { HYPERFRAMES_CHROME_VERSION, HYPERFRAMES_FORMAT_VERSION, hyperframesBounds } from './constants';

/*
 * The three files of `<data home>/hyperframes/` (SPEC 0008 section 4.5). Only the CLI writes them:
 * `engine.json` by `enable` and `disable`, `chrome.json` by `chrome install`, `trace.json` by
 * `trace`. The watcher reads them and writes nothing there.
 */

const ActorSchema = z.string().min(1).max(100);

export const HyperframesEngineFileSchema = z
  .object({
    format: z.literal(HYPERFRAMES_FORMAT_VERSION),
    state: z.enum(['disabled', 'enabled']),
    updatedAt: IsoDateTimeSchema,
    updatedBy: ActorSchema,
  })
  .strict();
export type HyperframesEngineFile = z.infer<typeof HyperframesEngineFileSchema>;

export const HyperframesChromeFileSchema = z
  .object({
    format: z.literal(HYPERFRAMES_FORMAT_VERSION),
    version: z.literal(HYPERFRAMES_CHROME_VERSION),
    executablePath: AbsolutePathSchema,
    sha256: Sha256Schema,
    sizeBytes: z.number().int().positive(),
    installedAt: IsoDateTimeSchema,
    installedBy: ActorSchema,
  })
  .strict();
export type HyperframesChromeFile = z.infer<typeof HyperframesChromeFileSchema>;

export const HyperframesTraceFileSchema = z
  .object({
    format: z.literal(HYPERFRAMES_FORMAT_VERSION),
    result: z.enum(['pass', 'fail']),
    at: IsoDateTimeSchema,
    by: ActorSchema,
    pin: z.string().max(20),
    chromeSha256: Sha256Schema,
    profileSha256: Sha256Schema,
    templateContentHash: Sha256Schema,
    controlDenied: z.boolean(),
    renderExitCode: z.number().int(),
    outputOk: z.boolean(),
    deniedNetwork: z.number().int().nonnegative(),
    ownerConfigDirDenied: z.number().int().nonnegative(),
    findings: z.array(z.string().max(hyperframesBounds.findingChars)).max(hyperframesBounds.traceFindings),
  })
  .strict();
export type HyperframesTraceFile = z.infer<typeof HyperframesTraceFileSchema>;
