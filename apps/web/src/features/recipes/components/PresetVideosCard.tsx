import { Alert, Card, VideoPlayer, textLinkClassName, type VideoAspect } from '@studio/ui';
import { RUN_FINAL_VIDEO_PATH } from '@studio/shared/api';
import Link from 'next/link';
import { type ReactElement } from 'react';
import { runArtifactUrl } from '@/features/runs/runs-api';
import { type WebMessages } from '@/messages';
import { type PresetVideosResult } from '../preset-videos.server';
import styles from './PresetVideosCard.module.css';

interface PresetVideosCardProps {
  result: PresetVideosResult;
  aspect: VideoAspect;
  texts: WebMessages['recipes']['detail']['videos'];
}

/** The final videos saved from this preset's runs, each with a player and links to its asset and review. */
export function PresetVideosCard({ result, aspect, texts }: PresetVideosCardProps): ReactElement {
  return (
    <Card title={texts.title} description={texts.description}>
      {result.status === 'failed' && <Alert variant="error">{texts.failed}</Alert>}
      {result.status === 'ready' && result.videos.length === 0 && <p className="caption">{texts.empty}</p>}
      {result.status === 'ready' && result.videos.length > 0 && (
        <ul className={aspect === '9:16' ? `${styles.grid} ${styles.vertical}` : styles.grid}>
          {result.videos.map((video) => (
            <li key={`${video.assetId}@${video.version}`} className={styles.item}>
              <VideoPlayer src={runArtifactUrl(video.runId, RUN_FINAL_VIDEO_PATH)} title={texts.player(video.name)} aspect={aspect} />
              <p className={styles.name}>{video.name}</p>
              <p className="caption mono">
                {video.assetId}@{video.version} · {video.recipeRef}
              </p>
              <div className={styles.links}>
                <Link href={`/catalogo/${encodeURIComponent(video.assetId)}`} className={textLinkClassName()}>
                  {texts.openInCatalog}
                </Link>
                <Link href={`/execucoes/${encodeURIComponent(video.runId)}/revisao`} className={textLinkClassName()}>
                  {texts.openReview}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
