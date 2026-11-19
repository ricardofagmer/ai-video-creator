import type { RenderScene } from '@studio/shared/ace';

export interface SceneSlot {
  scene: RenderScene;
  index: number;
  /** 1-based position among scenes of the same kind (e.g. step 2 of 3). */
  kindNumber: number;
  kindCount: number;
  from: number;
  durationInFrames: number;
}

/**
 * Maps scene seconds to frame windows. Each scene runs until the next one starts,
 * the first starts at frame 0 and the last fills the tail, so timing gaps never
 * render black frames (QA blackdetect).
 */
export function buildSceneSlots(scenes: readonly RenderScene[], fps: number, totalFrames: number): SceneSlot[] {
  const ordered = [...scenes].sort((left, right) => left.startS - right.startS);
  const kindTotals = new Map<string, number>();
  ordered.forEach((scene) => kindTotals.set(scene.kind, (kindTotals.get(scene.kind) ?? 0) + 1));
  const kindSeen = new Map<string, number>();

  return ordered.map((scene, index) => {
    const next = ordered[index + 1];
    const from = index === 0 ? 0 : Math.min(Math.round(scene.startS * fps), totalFrames - 1);
    const end = next ? Math.round(next.startS * fps) : totalFrames;
    const kindNumber = (kindSeen.get(scene.kind) ?? 0) + 1;
    kindSeen.set(scene.kind, kindNumber);
    return {
      scene,
      index,
      kindNumber,
      kindCount: kindTotals.get(scene.kind) ?? 1,
      from,
      durationInFrames: Math.max(1, Math.min(end, totalFrames) - from),
    };
  });
}
