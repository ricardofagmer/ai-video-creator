'use client';

import type { ReactElement, ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import styles from './VideoPlayer.module.css';

export type VideoAspect = '16:9' | '9:16';

export interface VideoPlayerProps {
  /** URL of `final.mp4` served by the api. */
  src: string;
  /** Accessible name, for example "Vídeo final da execução 2026-11-18-001". */
  title: string;
  aspect: VideoAspect;
  poster?: string;
  /** WebVTT captions of the narration. */
  captionsSrc?: string;
  captionsLabel?: string;
  /** Text under the player (duration, resolution, loudness). */
  caption?: ReactNode;
  className?: string;
}

/** Native video player for the review screen; keyboard and captions come from the browser. */
export function VideoPlayer({
  src,
  title,
  aspect,
  poster,
  captionsSrc,
  captionsLabel,
  caption,
  className,
}: VideoPlayerProps): ReactElement {
  const { ui } = useI18n();
  return (
    <figure className={classNames(styles.figure, aspect === '9:16' ? styles.portrait : styles.landscape, className)}>
      <div className={styles.frame}>
        <video controls preload="metadata" poster={poster} aria-label={title} className={styles.video}>
          <source src={src} type="video/mp4" />
          {captionsSrc && <track kind="captions" src={captionsSrc} srcLang="pt-BR" label={captionsLabel ?? ui.review.captionsLabel} default />}
          <p>
            {ui.review.videoUnsupported} <a href={src}>{ui.review.openVideoFile}</a>.
          </p>
        </video>
      </div>
      {caption && <figcaption className={classNames('caption', styles.caption)}>{caption}</figcaption>}
    </figure>
  );
}
