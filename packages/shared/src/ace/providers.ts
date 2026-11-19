import type { WordTiming } from './manifests';
import type { RenderInput } from './render';

/**
 * Research, claim extraction, scripting and editorial review are done by Claude Code
 * itself through the fagmer-video-* skills, never through the Claude API. The toolbox
 * only wraps what a chat session cannot do: voice audio, browser capture and rendering.
 */

export interface ProviderUsage {
  provider: string;
  unit: 'characters' | 'render_seconds' | 'capture_seconds';
  quantity: number;
  usdEstimate: number;
  requestId?: string;
}

export interface WithUsage {
  usage: ProviderUsage[];
}

export type ProviderMode = 'mock' | 'live';

// Voice -----------------------------------------------------------------
export interface VoiceRequest {
  text: string;
}
export interface VoiceResult extends WithUsage {
  audio: Uint8Array;
  mimeType: 'audio/mpeg' | 'audio/wav';
  durationS: number;
  voice: string;
  words: WordTiming[];
}
export interface VoiceProvider {
  synthesize(input: VoiceRequest): Promise<VoiceResult>;
}

// Media -----------------------------------------------------------------
export interface CaptureRequest {
  sceneId: string;
  /** Capture target URL; must be on CAPTURE_ALLOWED_HOSTS for live captures. */
  url?: string;
  /** Brief for a title-card visual when there is no capture target. */
  brief: string;
  onScreenText: string;
  durationS: number;
}
export interface CaptureResult extends WithUsage {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'video/webm' | 'video/mp4';
  kind: 'capture' | 'title-card';
  provenance: string;
  license: string;
}
export interface MediaProvider {
  capture(input: CaptureRequest): Promise<CaptureResult>;
}

// Render ----------------------------------------------------------------
export interface RenderRequest {
  input: RenderInput;
  outputPath: string;
  thumbnailPath: string;
}
export interface RenderResult {
  durationS: number;
  renderSeconds: number;
}

/** Thrown for policy, rights or evidence failures: never retried, moves the run to BLOCKED. */
export class BlockedError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'UNSUPPORTED_CLAIM'
      | 'INSUFFICIENT_SOURCES'
      | 'UNLICENSED_ASSET'
      | 'CAPTURE_NOT_ALLOWED'
      | 'QA_BLOCKING'
      | 'DURATION_OUT_OF_RANGE'
      | 'NARRATION_LENGTH'
      | 'COST_LIMIT',
  ) {
    super(message);
    this.name = 'BlockedError';
  }
}
