'use client';

import { classNames, startPlayback, useI18n, type VideoAspect } from '@studio/ui';
import { useEffect, useRef, type MouseEvent, type ReactElement } from 'react';
import styles from '../review.module.css';

interface BiometricVideoPlayerProps {
  /** Same-origin BFF URL of `final.mp4`; the api serves it to this session only, `no-store`. */
  src: string;
  title: string;
  aspect: VideoAspect;
  caption?: string;
  /** Starts playback on mount, muted when the browser refuses sound without a user gesture. */
  autoPlay?: boolean;
}

/** Hides the browser's "save video" menu entry; the native controls stay keyboard reachable. */
function preventContextMenu(event: MouseEvent<HTMLVideoElement>): void {
  event.preventDefault();
}

/**
 * Player for a `playable-biometric` run (SPEC 0002 rev 4, section 13.5; owner decision "Play for
 * logged-in owner"): native controls without the download control, picture-in-picture or remote
 * playback, and no fallback link, download button or `download` attribute (R4-13). Unlike the
 * shared `VideoPlayer`, nothing here points at the artifact route except the media source itself.
 * Known limit accepted by the owner: `nodownload` does not stop the owner saving what plays.
 */
export function BiometricVideoPlayer({ src, title, aspect, caption, autoPlay = false }: BiometricVideoPlayerProps): ReactElement {
  const { ui } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (autoPlay && videoRef.current !== null) startPlayback(videoRef.current);
  }, [autoPlay]);
  return (
    <figure className={classNames(styles.playerFigure, aspect === '9:16' ? styles.playerPortrait : styles.playerLandscape)}>
      <div className={styles.playerFrame}>
        <video
          ref={videoRef}
          controls
          controlsList="nodownload"
          disablePictureInPicture
          disableRemotePlayback
          preload={autoPlay ? 'auto' : 'metadata'}
          aria-label={title}
          className={styles.playerVideo}
          onContextMenu={preventContextMenu}
        >
          <source src={src} type="video/mp4" />
          <p>{ui.review.videoUnsupported}</p>
        </video>
      </div>
      {caption !== undefined && <figcaption className={classNames('caption', styles.playerCaption)}>{caption}</figcaption>}
    </figure>
  );
}
