'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import styles from '../catalog.module.css';
import { videoEmbedShape, videoEmbedUrl, type VideoPost } from '../video-link';

const INSTAGRAM_ORIGIN = 'https://www.instagram.com';
const MIN_MEASURED_HEIGHT = 120;
const MAX_MEASURED_HEIGHT = 2000;

const SHAPE_CLASSES = {
  'instagram-card': styles.embedInstagram,
  vertical: styles.embedVertical,
  landscape: styles.embedLandscape,
} as const;

function subscribeToNothing(): () => void {
  return () => undefined;
}

function currentHost(): string {
  return window.location.hostname;
}

function noHostOnServer(): null {
  return null;
}

function parsedMessage(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/** Instagram's embed page posts `{"type":"MEASURE","details":{"height":N}}` as it lays out the post. */
function measuredHeightOf(data: unknown): number | null {
  const message = parsedMessage(data);
  if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'MEASURE') return null;
  if (!('details' in message)) return null;
  const { details } = message;
  if (typeof details !== 'object' || details === null || !('height' in details) || typeof details.height !== 'number') return null;
  const height = Math.ceil(details.height);
  return height >= MIN_MEASURED_HEIGHT && height <= MAX_MEASURED_HEIGHT ? height : null;
}

/**
 * The platform's official embed in a sandboxed iframe: its script runs in the platform's origin, never in
 * the studio's, and the CSP admits only these embed hosts. Only the parsed post id reaches the `src`.
 * Instagram's post card sizes itself, so its frame takes the height the embed reports and never scrolls;
 * every other player fills a 16:9 or 9:16 box.
 */
export function VideoEmbed({ post, title }: { post: VideoPost; title: string }): ReactElement {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const parentHost = useSyncExternalStore(subscribeToNothing, currentHost, noHostOnServer);
  const shape = videoEmbedShape(post);

  useEffect(() => {
    if (shape !== 'instagram-card') return undefined;
    function handleMessage(event: MessageEvent): void {
      if (event.origin !== INSTAGRAM_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      const height = measuredHeightOf(event.data);
      if (height !== null) setMeasuredHeight(height);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [shape]);

  return (
    <div className={`${styles.embedFrame} ${SHAPE_CLASSES[shape]}`}>
      <iframe
        ref={frameRef}
        // Twitch needs the page's host, known only in the browser; the frame stays blank until then.
        src={parentHost === null ? undefined : videoEmbedUrl(post, parentHost)}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
        allow="encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        allowFullScreen
        scrolling="no"
        style={measuredHeight === null ? undefined : { height: `${measuredHeight}px` }}
        className={styles.embed}
      />
    </div>
  );
}
