import { homedir } from 'node:os';
import { type FolderFileSource, type FolderReader, type FolderVersionSource, type ListFolderOptions } from '@studio/core/asset-store';
import { type DataHome } from '@studio/core/paths';
import { locateSandboxStudioRoot, type StudioRuntime } from '@studio/core/runtime';
import { checkRenderRuntime, workspaceRoot, type CheckedRenderRuntime, type RenderRuntimeAnswer } from '@studio/hyperframes';
import { type StageSettings } from '../shared/stage-settings';

/** What the render runtime gate reads from the stage settings: the owner's home, the child PATH, ffmpeg, ffprobe, the studio ports. */
export type EngineRuntimeSettings = Pick<StageSettings, 'home' | 'path' | 'ffmpegPath' | 'ffprobePath' | 'studioPorts'>;

/**
 * What the composition stage needs to start a HyperFrames render (SPEC 0008 sections 4.5 and 5.2),
 * as one port so tests answer it without the pinned package or `sandbox-exec`. The watcher only
 * reads `<data home>/hyperframes/`; it never writes there (B6). Neither member starts a process.
 */
export interface HyperframesStagePorts {
  /** Check 1: the render runtime gate for a render, answered as the runtime or the first refusal reason. */
  renderRuntime(settings: EngineRuntimeSettings): Promise<RenderRuntimeAnswer<CheckedRenderRuntime>>;
  listTemplateFiles(source: FolderVersionSource, options: ListFolderOptions): Promise<FolderFileSource[]>;
}

export function realHyperframesStagePorts(dataHome: DataHome, folders: FolderReader, runtime: StudioRuntime): HyperframesStagePorts {
  return {
    renderRuntime: (settings) =>
      checkRenderRuntime({
        purpose: 'render',
        dataHomeRoot: dataHome.root,
        ownerHome: settings.home ?? homedir(),
        searchPath: settings.path,
        ffmpeg: settings.ffmpegPath,
        ffprobe: settings.ffprobePath,
        studioPorts: settings.studioPorts,
        // The monorepo root in development, the app's runtime folder when packaged (the sandbox denies `.env` reads under it).
        studioRoot: locateSandboxStudioRoot(runtime, workspaceRoot()),
      }),
    listTemplateFiles: (source, options) => folders.listFiles(source, options),
  };
}
