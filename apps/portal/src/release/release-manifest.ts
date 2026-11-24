import { InstallPlatformSchema, InstallVersionSchema, type InstallPlatform } from '@studio/shared/api';
import { z } from 'zod';
import { isReleaseUrlAllowed } from './release-url';

/**
 * Contract C2 rev 2 (`.specs/features/desktop-installer/plan.md` sections 3 and 9): `latest.json`,
 * published by the release workflow (ticket 05). It has no shared home, so the portal is its only
 * reader in the browser. Unknown fields are dropped rather than refused, so a later additive
 * revision does not take the downloads away; every field the page shows is checked.
 */
const HttpsUrlSchema = z
  .string()
  .max(2048)
  .url()
  .refine((value) => isReleaseUrlAllowed(value), { message: 'https only' });

const Sha256Schema = z.string().regex(/^[0-9a-fA-F]{64}$/);

export const ReleaseAssetSchema = z.object({
  platform: InstallPlatformSchema,
  file: z.string().min(1).max(256),
  url: HttpsUrlSchema,
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative(),
});
export type ReleaseAsset = z.infer<typeof ReleaseAssetSchema>;

export const ReleaseSourceSchema = z.object({
  name: z.string().min(1).max(64),
  licence: z.string().min(1).max(64),
  url: HttpsUrlSchema,
  sha256: Sha256Schema,
});
export type ReleaseSource = z.infer<typeof ReleaseSourceSchema>;

export const ReleaseManifestSchema = z.object({
  version: InstallVersionSchema,
  publishedAt: z.string().datetime({ offset: true }),
  assets: z.array(ReleaseAssetSchema).max(16),
  sources: z.array(ReleaseSourceSchema).max(16),
});
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;

export function assetFor(manifest: ReleaseManifest, platform: InstallPlatform): ReleaseAsset | undefined {
  return manifest.assets.find((asset) => asset.platform === platform);
}

/** The corresponding-source archive of the bundled GPL ffmpeg (DI-AC-25). */
export function ffmpegSource(manifest: ReleaseManifest): ReleaseSource | undefined {
  return manifest.sources.find((source) => source.name === 'ffmpeg');
}
