import {
  RenderInputSchema,
  type AssetManifest,
  type NarrationManifest,
  type RenderInput,
  type RenderScene,
  type ScriptManifest,
  type TemplateId,
} from '@studio/shared/ace';

const RENDER_DISCLOSURE = 'AI-generated voice. Links may be affiliate.';
/** Short hold after the last word so the CTA is not cut mid-breath; kept under the 2 s silence gate. */
const TAIL_HOLD_S = 1;

export interface RenderInputSources {
  template: TemplateId;
  script: ScriptManifest;
  assets: AssetManifest;
  narration: NarrationManifest;
  baseUrl: string;
}

function assetUrl(baseUrl: string, storageKey: string): string {
  return `${baseUrl}/${storageKey.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
}

export function toRenderInput(sources: RenderInputSources): RenderInput {
  const { script, assets, narration, baseUrl } = sources;
  const durationS = narration.durationS + TAIL_HOLD_S;
  const timingsById = new Map(narration.sceneTimings.map((timing) => [timing.sceneId, timing]));
  const assetsBySceneId = new Map(assets.assets.map((asset) => [asset.sceneId, asset]));
  const scenes: RenderScene[] = script.scenes.map((scene, index) => {
    const timing = timingsById.get(scene.id);
    const asset = assetsBySceneId.get(scene.id);
    const isLast = index === script.scenes.length - 1;
    return {
      id: scene.id,
      kind: scene.kind,
      startS: timing?.startS ?? 0,
      endS: isLast ? durationS : (timing?.endS ?? durationS),
      onScreenText: scene.onScreenText,
      asset: asset
        ? { url: assetUrl(baseUrl, asset.storageKey), kind: asset.mimeType.startsWith('video/') ? 'video' : 'image' }
        : null,
    };
  });
  return RenderInputSchema.parse({
    template: sources.template,
    title: script.title,
    durationS,
    audioUrl: assetUrl(baseUrl, narration.audioKey),
    scenes,
    captions: narration.words,
    disclosure: RENDER_DISCLOSURE,
  });
}
