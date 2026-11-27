import { Alert, Card, ErrorState, Table, VideoPlayer, shortenHash, type Locale, type TableColumn, type VideoAspect } from '@studio/ui';
import { type AspectRatio } from '@studio/shared/catalog';
import { type QaSummary } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatClock } from '@/features/runs/run-labels';
import { runArtifactUrl } from '@/features/runs/runs-api';
import { FINAL_VIDEO_PATH, type ArtifactRead, type VideoAccess, type WithheldItem } from '../media-safety';
import { formatDecimal } from '@/lib/i18n/format';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';
import { BiometricVideoPlayer } from './BiometricVideoPlayer';

interface ReviewVideoCardProps {
  runId: string;
  aspect: AspectRatio;
  video: VideoAccess;
  qa: ArtifactRead<QaSummary>;
  /** The run page redirected here as the run finished: the video starts on its own. */
  autoPlay?: boolean;
}

type VideoTexts = WebMessages['runs']['review']['video'];

function withheldColumns(t: VideoTexts): readonly TableColumn<WithheldItem>[] {
  return [
  { key: 'ref', header: t.asset, rowHeader: true, render: (item) => <span className="mono">{item.ref}</span> },
  {
    key: 'hash',
    header: t.hash,
    render: (item) => (item.contentHash === null ? '—' : <span className="mono" title={item.contentHash}>{shortenHash(item.contentHash)}</span>),
  },
  ];
}

/** VideoPlayer takes 16:9 and 9:16; a 1:1 recipe uses the landscape frame (no R1 recipe is 1:1). */
function playerAspect(aspect: AspectRatio): VideoAspect {
  return aspect === '9:16' ? '9:16' : '16:9';
}

function videoCaption(qa: ArtifactRead<QaSummary>, locale: Locale): string | undefined {
  if (qa.status !== 'present') return undefined;
  const { durationMs, width, height, audio } = qa.value.metrics;
  const parts = [formatClock(durationMs), `${width}x${height}`];
  if (audio.status === 'present') parts.push(`${formatDecimal(audio.integratedLufs, locale, 1, true)} LUFS`);
  return parts.join(' · ');
}

/**
 * Card "Vídeo" (design/telas/09), driven by the api's `artifactAccess` (SPEC 0002 rev 4, section
 * 13.5): `playable` uses the shared player; `playable-biometric` uses a player with no download
 * control or link and a notice; `withheld` renders no `video` element, only refs and hashes.
 */
export async function ReviewVideoCard({ runId, aspect, video, qa, autoPlay = false }: ReviewVideoCardProps): Promise<ReactElement> {
  const { t, locale } = await getI18n();
  const texts = t.runs.review.video;
  const title = texts.playerTitle(runId);
  return (
    <Card title={texts.card}>
      {video.kind === 'playable' && (
        <VideoPlayer src={runArtifactUrl(runId, FINAL_VIDEO_PATH)} title={title} aspect={playerAspect(aspect)} caption={videoCaption(qa, locale)} autoPlay={autoPlay} />
      )}
      {video.kind === 'playable-biometric' && (
        <div className={layout.stack}>
          <Alert variant="info" title={texts.biometricTitle}>
            {texts.biometricNotice}
          </Alert>
          <BiometricVideoPlayer
            src={runArtifactUrl(runId, FINAL_VIDEO_PATH)}
            title={title}
            aspect={playerAspect(aspect)}
            caption={videoCaption(qa, locale)}
            autoPlay={autoPlay}
          />
        </div>
      )}
      {video.kind === 'withheld' && (
        <div className={layout.stack}>
          <Alert variant="warning" title={texts.withheldTitle}>
            {texts.withheldReason}
          </Alert>
          {video.items.length > 0 && (
            <Table caption={texts.withheldTable} columns={withheldColumns(texts)} rows={video.items} rowKey={(item) => item.ref} emptyText={texts.noItems} />
          )}
        </div>
      )}
      {video.kind === 'missing' && (
        <ErrorState
          title={texts.missingTitle}
          description={
            <>
              {texts.missingBefore}
              <code>studio doctor</code>
              {texts.missingAfter}
            </>
          }
        />
      )}
    </Card>
  );
}
