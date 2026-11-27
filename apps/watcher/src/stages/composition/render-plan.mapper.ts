import { extname } from 'node:path';
import { type ScenesOutput, type ScriptOutput } from '@studio/shared/agents';
import type { ResolvedAsset } from '@studio/shared/ports';
import { type RenderRequest, type RenderSceneRequest } from '../process/tool-runner.protocol';
import { type CapturesIndex, type NarrationIndex } from '../shared/stage-artifacts';

type TemplateId = RenderRequest['template'];

interface Canvas {
  width: number;
  height: number;
}

/** `@ace/video` composition ids (`packages/shared/src/ace/render.ts` `compositionIds`). */
const templateByCompositionId: ReadonlyMap<string, TemplateId> = new Map<string, TemplateId>([
  ['ToolDemo', 'TOOL_DEMO'],
  ['AiBattle', 'AI_BATTLE'],
  ['AutomationBlueprint', 'AUTOMATION_BLUEPRINT'],
  ['ProductTour16x9', 'PRODUCT_TOUR_16X9'],
]);

/** The absorbed 9:16 templates render `videoSpec` (`@studio/shared/ace`). */
const VERTICAL_CANVAS: Canvas = { width: 1080, height: 1920 };

/** The one canvas each template renders; the 16:9 tour is `TOUR_CANVAS` of `@ace/video` (R1-15). */
const canvasByTemplateId: Readonly<Record<TemplateId, Canvas>> = {
  TOOL_DEMO: VERTICAL_CANVAS,
  AI_BATTLE: VERTICAL_CANVAS,
  AUTOMATION_BLUEPRINT: VERTICAL_CANVAS,
  PRODUCT_TOUR_16X9: { width: 1920, height: 1080 },
};

const MAX_ON_SCREEN_TEXT = 200;

/** A file copied into the render's private serve folder, under `name`. */
export interface StagedFile {
  source: string;
  name: string;
}

export interface RenderPlan {
  scenes: RenderSceneRequest[];
  files: StagedFile[];
}

export function templateIdOf(compositionId: string): TemplateId | null {
  return templateByCompositionId.get(compositionId) ?? null;
}

/** A recipe canvas the template does not render is refused before any work. */
export function rendersOnCanvas(templateId: TemplateId, canvas: Canvas): boolean {
  const renderable = canvasByTemplateId[templateId];
  return canvas.width === renderable.width && canvas.height === renderable.height;
}

/**
 * Maps the director's scenes onto `@ace/video` scenes. Timings come from the narration's per-scene
 * timings when every scene has one, else the narration is split evenly. Visuals: a capture plays
 * its recorded file, a bound non-biometric image or video asset is shown as is, a title card is
 * text only. The renderer reads nothing but the staged copies.
 */
export function renderPlan(sources: {
  runDirPathOf: (relativePath: string) => string;
  scenes: ScenesOutput;
  script: ScriptOutput;
  captures: CapturesIndex | null;
  narration: NarrationIndex;
  assets: readonly ResolvedAsset[];
}): RenderPlan {
  const files: StagedFile[] = [];
  const stage = (source: string, stem: string): string => {
    const existing = files.find((file) => file.source === source);
    if (existing !== undefined) return existing.name;
    const name = `${stem}${extname(source).toLowerCase()}`;
    files.push({ source, name });
    return name;
  };
  const timings = sceneTimings(sources.scenes, sources.narration);
  const lastIndex = sources.scenes.scenes.length - 1;
  const scenes = sources.scenes.scenes.map((scene, index): RenderSceneRequest => {
    const scriptScene = sources.script.scenes.find((candidate) => candidate.sceneId === scene.sceneId);
    const titleText = scene.visual.type === 'title-card' ? scene.visual.text : undefined;
    const timing = timings[index] ?? { startS: 0, endS: sources.narration.durationS };
    return {
      id: scene.sceneId.slice(0, 64),
      kind: index === 0 ? 'hook' : index === lastIndex ? 'cta' : 'step',
      startS: timing.startS,
      endS: timing.endS,
      onScreenText: (scene.onScreenText ?? titleText ?? scriptScene?.onScreenText ?? '').slice(0, MAX_ON_SCREEN_TEXT),
      asset: visualAsset(scene.visual, { ...sources, stage, index }),
    };
  });
  return { scenes, files };
}

type SceneSpan = { startS: number; endS: number };

export function sceneTimings(scenes: ScenesOutput, narration: NarrationIndex): SceneSpan[] {
  const byScene = new Map(narration.sceneTimings.map((timing) => [timing.sceneId, timing]));
  const matched = scenes.scenes.map((scene) => byScene.get(scene.sceneId));
  if (matched.every((timing) => timing !== undefined && timing.endS > timing.startS)) {
    return matched.flatMap((timing) => (timing === undefined ? [] : [{ startS: timing.startS, endS: timing.endS }]));
  }
  const parented = timingsByParentScene(scenes, narration);
  if (parented !== null) return parented;
  const slotS = narration.durationS / scenes.scenes.length;
  return scenes.scenes.map((_scene, index) => ({ startS: index * slotS, endS: (index + 1) * slotS }));
}

function sharedPrefixLength(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
  return length;
}

/**
 * The director may split one narrated scene into several shots with ids of its own
 * (`s1-catalogo` narrated, `s1a-catalogo` and `s1b-catalogo` directed). Without this, every shot
 * fell back to an even slot of the whole narration and the pictures drifted from the voice. Each
 * shot goes to the narrated scene whose id shares the longest prefix with its own, never to one
 * before the previous shot's; the shots of one narrated scene share its stretch evenly. Null when
 * a shot shares no prefix at all, so the caller keeps the even split.
 */
function timingsByParentScene(scenes: ScenesOutput, narration: NarrationIndex): SceneSpan[] | null {
  const narrated = narration.sceneTimings.filter((timing) => timing.endS > timing.startS);
  if (narrated.length === 0) return null;
  const parents: number[] = [];
  let earliest = 0;
  for (const scene of scenes.scenes) {
    let best = -1;
    let bestLength = 0;
    for (let index = earliest; index < narrated.length; index += 1) {
      const timing = narrated[index];
      if (timing === undefined) continue;
      const length = timing.sceneId === scene.sceneId ? Number.MAX_SAFE_INTEGER : sharedPrefixLength(timing.sceneId, scene.sceneId);
      if (length > bestLength) {
        best = index;
        bestLength = length;
      }
    }
    if (best < 0) return null;
    parents.push(best);
    earliest = best;
  }
  return parents.map((parent, index) => {
    const timing = narrated[parent];
    if (timing === undefined) return { startS: 0, endS: narration.durationS };
    const siblings = parents.filter((candidate) => candidate === parent).length;
    const position = parents.slice(0, index).filter((candidate) => candidate === parent).length;
    const shareS = (timing.endS - timing.startS) / siblings;
    return { startS: timing.startS + position * shareS, endS: timing.startS + (position + 1) * shareS };
  });
}

export function visualAsset(
  visual: ScenesOutput['scenes'][number]['visual'],
  sources: {
    runDirPathOf: (relativePath: string) => string;
    captures: CapturesIndex | null;
    assets: readonly ResolvedAsset[];
    stage: (source: string, stem: string) => string;
    index: number;
  },
): RenderSceneRequest['asset'] {
  if (visual.type === 'capture') {
    const capture = sources.captures?.captures.find((candidate) => candidate.captureId === visual.captureId);
    return capture === undefined ? null : { path: sources.stage(sources.runDirPathOf(capture.path), capture.captureId), kind: 'video' };
  }
  if (visual.type !== 'asset') return null;
  const asset = sources.assets.find((candidate) => candidate.ref === visual.ref);
  if (asset === undefined || asset.sensitivity === 'biometric' || asset.layout !== 'file') return null;
  const kind = asset.mimeType.startsWith('image/') ? 'image' : asset.mimeType.startsWith('video/') ? 'video' : null;
  return kind === null ? null : { path: sources.stage(asset.absolutePath, `asset-${sources.index + 1}`), kind };
}
