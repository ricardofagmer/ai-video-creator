import { extname } from 'node:path';
import { type ScenesOutput } from '@studio/shared/agents';
import type { ResolvedAsset } from '@studio/shared/ports';
import { type HyperframesRenderRequest } from '../process/tool-runner.protocol';
import { type CapturesIndex, type NarrationIndex } from '../shared/stage-artifacts';
import { sceneTimings, visualAsset, type StagedFile } from './render-plan.mapper';

/*
 * The picture behind a HyperFrames template's text. Template variables are flat text and numbers,
 * so the run's media cannot be passed as variables: instead the scenes' visuals (the site capture,
 * a bound image or video) are cut into one clip the tool runner writes into the staged template
 * copy as `media/background.mp4`. A template opts in by referencing that file.
 */

type BackgroundSegment = NonNullable<HyperframesRenderRequest['background']>['segments'][number];

/** One stretch of the background: a staged file name (null for a plain dark stretch) and how long it shows. */
export interface PlannedSegment {
  name: string | null;
  kind: BackgroundSegment['kind'];
  durationS: number;
}

export interface BackgroundPlan {
  segments: PlannedSegment[];
  files: StagedFile[];
}

/** Shorter than one frame at any supported rate; such a stretch is merged into its neighbour. */
const MIN_SEGMENT_S = 0.05;

interface BackgroundSources {
  runDirPathOf: (relativePath: string) => string;
  scenes: ScenesOutput | null;
  captures: CapturesIndex | null;
  narration: NarrationIndex;
  assets: readonly ResolvedAsset[];
}

/**
 * One segment per directed scene, in narration order and without gaps. A scene with no usable
 * visual shows the run's first site capture when there is one (the brief's own source), else what
 * the scene before it showed, else a plain dark stretch.
 */
export function backgroundPlan(sources: BackgroundSources): BackgroundPlan {
  const files: StagedFile[] = [];
  const stage = (source: string, stem: string): string => {
    const existing = files.find((file) => file.source === source);
    if (existing !== undefined) return existing.name;
    const name = `${stem}${extname(source).toLowerCase()}`;
    files.push({ source, name });
    return name;
  };
  const firstCapture = sources.captures?.captures[0];
  const fallback = (): Pick<PlannedSegment, 'name' | 'kind'> | null =>
    firstCapture === undefined ? null : { name: stage(sources.runDirPathOf(firstCapture.path), firstCapture.captureId), kind: 'video' };

  const total = sources.narration.durationS;
  if (sources.scenes === null || sources.scenes.scenes.length === 0) {
    const only = fallback();
    return { segments: [{ name: only?.name ?? null, kind: only?.kind ?? 'blank', durationS: total }], files };
  }
  const directed = sources.scenes.scenes;
  const timings = sceneTimings(sources.scenes, sources.narration);
  const segments: PlannedSegment[] = [];
  let previous: Pick<PlannedSegment, 'name' | 'kind'> | null = null;
  directed.forEach((scene, index) => {
    const startS = index === 0 ? 0 : (timings[index]?.startS ?? total);
    const endS = index === directed.length - 1 ? total : (timings[index + 1]?.startS ?? total);
    const durationS = endS - startS;
    const asset = visualAsset(scene.visual, { runDirPathOf: sources.runDirPathOf, captures: sources.captures, assets: sources.assets, stage, index });
    const shown = asset !== null ? { name: asset.path, kind: asset.kind } : (fallback() ?? previous);
    previous = shown;
    if (durationS < MIN_SEGMENT_S) return;
    segments.push({ name: shown?.name ?? null, kind: shown?.kind ?? 'blank', durationS });
  });
  if (segments.length === 0) segments.push({ name: null, kind: 'blank', durationS: total });
  return { segments, files };
}
