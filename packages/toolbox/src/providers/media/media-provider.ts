import type { CaptureRequest, CaptureResult, MediaProvider } from '@studio/shared/ace';
import type { ToolboxEnv } from '../../config/env';
import { assertCaptureTargetsAllowed } from './capture-url';
import { PlaywrightRecorder } from './playwright-capture';
import { titleCardLicense, titleCardPng, titleCardProvenance } from './title-card';

export interface ClosableMediaProvider extends MediaProvider {
  readonly mode: 'mock' | 'live';
  close(): Promise<void>;
}

function titleCard(): CaptureResult {
  return {
    bytes: titleCardPng(),
    mimeType: 'image/png',
    kind: 'title-card',
    provenance: titleCardProvenance,
    license: titleCardLicense,
    usage: [],
  };
}

/** PROVIDER_MEDIA=mock: every scene gets a title card, nothing is opened. */
class TitleCardMediaProvider implements ClosableMediaProvider {
  readonly mode = 'mock';

  async capture(): Promise<CaptureResult> {
    return titleCard();
  }

  async close(): Promise<void> {}
}

/** PROVIDER_MEDIA=live: allowlisted URLs are recorded with Playwright, other scenes get title cards. */
class LiveMediaProvider implements ClosableMediaProvider {
  readonly mode = 'live';
  private readonly recorder = new PlaywrightRecorder();

  constructor(private readonly env: ToolboxEnv) {}

  async capture(input: CaptureRequest): Promise<CaptureResult> {
    if (!input.url) return titleCard();
    const url = new URL(input.url);
    assertCaptureTargetsAllowed([{ sceneId: input.sceneId, url }], this.env.captureAllowedHosts);
    return this.recorder.record({
      url,
      durationS: input.durationS,
      allowedHosts: this.env.captureAllowedHosts,
      viewport: this.env.captureViewport,
    });
  }

  async close(): Promise<void> {
    await this.recorder.close();
  }
}

export function createMediaProvider(env: ToolboxEnv): ClosableMediaProvider {
  return env.providerMedia === 'live' ? new LiveMediaProvider(env) : new TitleCardMediaProvider();
}
