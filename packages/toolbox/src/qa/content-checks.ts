import type { AssetManifest, ClaimManifest, QaCheck, ResearchManifest, ScriptManifest } from '@studio/shared/ace';
import { isClaimSupported, researchSourceUrls } from '../validation/claims-rules';

export interface ContentSources {
  research: ResearchManifest;
  claims: ClaimManifest;
  script: ScriptManifest;
  assets: AssetManifest;
}

function check(id: string, problems: readonly string[], okDetail: string): QaCheck {
  return { id, passed: problems.length === 0, blocking: true, detail: (problems.length === 0 ? okDetail : problems.join('; ')).slice(0, 1000) };
}

/** Spec §6 content gate: every scene has an asset, claims supported, licenses present. */
export function contentChecks(sources: ContentSources): QaCheck[] {
  const { research, claims, script, assets } = sources;
  const sceneIdsWithAsset = new Set(assets.assets.map((asset) => asset.sceneId));
  const missingAssets = script.scenes.filter((scene) => !sceneIdsWithAsset.has(scene.id)).map((scene) => `scene "${scene.id}" has no asset`);

  const sourceUrls = researchSourceUrls(research);
  const claimsById = new Map(claims.claims.map((claim) => [claim.id, claim]));
  const citedIds = new Set(script.scenes.flatMap((scene) => scene.claimIds));
  const unsupported = claims.claims
    .filter((claim) => (claim.material || citedIds.has(claim.id)) && !isClaimSupported(claim, sourceUrls))
    .map((claim) => `claim "${claim.id}" unsupported`);
  const unknown = [...citedIds].filter((id) => !claimsById.has(id)).map((id) => `claim "${id}" cited but unknown`);

  const licenseProblems = assets.assets.flatMap((asset) => [
    ...(asset.license.trim() ? [] : [`asset "${asset.id}" has no license`]),
    ...(asset.provenance.trim() ? [] : [`asset "${asset.id}" has no provenance`]),
    ...(asset.kind !== 'capture' && asset.presentedAsProof ? [`asset "${asset.id}" (${asset.kind}) is presented as proof`] : []),
  ]);

  return [
    check('scene-assets', missingAssets, `${script.scenes.length} scenes, all with an asset`),
    check('claims-supported', [...unsupported, ...unknown], `${claims.claims.length} claims, material and cited ones supported`),
    check('licenses', licenseProblems, `${assets.assets.length} assets with license and provenance`),
  ];
}
