'use client';

import { textLinkClassName } from '@studio/ui';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../catalog.module.css';

/** The page is laid out at a desktop width and scaled down to the box, so a card shows the whole first screen. */
const DESKTOP_WIDTH = 1280;
const DESKTOP_HEIGHT = 800;

type FrameState = 'checking' | 'allowed' | 'blocked' | 'unknown';

interface SiteEmbedProps {
  /** The parsed `https:` page of a site reference (siteLinkOf); never raw form text. */
  href: string;
  title: string;
  /** `preview`: a still, non-interactive thumbnail for a card. `live`: the page can be scrolled and clicked. */
  mode: 'preview' | 'live';
}

function isFrameState(value: unknown): value is FrameState {
  return value === 'allowed' || value === 'blocked' || value === 'unknown';
}

function policyOf(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'policy' in body ? body.policy : 'unknown';
}

/** Asks the BFF whether the site allows framing; any failure answers `unknown`, so the frame is tried. */
function useFrameState(href: string): FrameState {
  const [state, setState] = useState<FrameState>('checking');
  useEffect(() => {
    const controller = new AbortController();
    setState('checking');
    fetch(`/api/enquadramento?link=${encodeURIComponent(href)}`, { signal: controller.signal })
      .then(async (response) => (response.ok ? policyOf(await response.json()) : 'unknown'))
      .then((policy) => setState(isFrameState(policy) ? policy : 'unknown'))
      .catch(() => {
        if (!controller.signal.aborted) setState('unknown');
      });
    return () => controller.abort();
  }, [href]);
  return state;
}

/** Site icon from the site itself, with the first letter of the host when it has none. */
function SiteIcon({ hostname }: { hostname: string }): ReactElement {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  // The server-rendered image can fail before hydration attaches onError; catch that case on mount.
  useEffect(() => {
    const image = imageRef.current;
    if (image !== null && image.complete && image.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return <span className={styles.siteHostGlyph} aria-hidden>{hostname.replace(/^www\./, '').charAt(0).toUpperCase()}</span>;
  return (
    <img
      ref={imageRef}
      className={styles.siteHostIcon}
      src={`https://${hostname}/favicon.ico`}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * A saved website inside a sandboxed iframe, scaled from a 1280x800 desktop view to the width of its box.
 * The viewer's browser loads the page straight from the owner's link, with no referrer; the server only
 * reads the site's framing headers (/api/enquadramento). Sites that refuse framing show a host card instead.
 */
export function SiteEmbed({ href, title, mode }: SiteEmbedProps): ReactElement {
  const t = useWebMessages();
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const frameState = useFrameState(href);
  const hostname = new URL(href).hostname;

  useEffect(() => {
    const box = boxRef.current;
    if (box === null) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setScale(entry.contentRect.width / DESKTOP_WIDTH);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const showFrame = scale !== null && (frameState === 'allowed' || frameState === 'unknown');
  const previewClass = showFrame ? styles.siteEmbedPreview : `${styles.siteEmbedPreview} ${styles.siteEmbedPainted}`;
  const modeClass = mode === 'preview' ? previewClass : frameState === 'blocked' ? styles.siteEmbedRefused : '';
  const className = `${styles.siteEmbed} ${modeClass}`;

  return (
    <div ref={boxRef} className={className}>
      {showFrame ? (
        <iframe
          src={href}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox={mode === 'preview' ? 'allow-scripts allow-same-origin' : 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms'}
          tabIndex={mode === 'preview' ? -1 : undefined}
          aria-hidden={mode === 'preview' ? true : undefined}
          className={styles.siteEmbedFrame}
          style={{ width: `${DESKTOP_WIDTH}px`, height: `${DESKTOP_HEIGHT}px`, transform: `scale(${scale})` }}
        />
      ) : (
        <div className={styles.siteHost} aria-busy={frameState === 'checking'}>
          <SiteIcon hostname={hostname} />
          <span className={styles.siteHostName}>{hostname}</span>
          {frameState === 'blocked' && <span className="caption">{t.catalog.siteLink.frameRefused}</span>}
          {/* A preview sits inside the card's link already; an anchor here would nest. */}
          {frameState === 'blocked' && mode === 'live' && (
            <a href={href} target="_blank" rel="noopener noreferrer" className={textLinkClassName()}>
              {t.catalog.siteLink.openSite(hostname)}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
