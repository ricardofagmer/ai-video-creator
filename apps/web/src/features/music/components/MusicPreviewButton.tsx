'use client';

import { Button, Icon } from '@studio/ui';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { claimPlayback, releasePlayback } from '@/features/voices/exclusive-playback';
import styles from '@/features/voices/components/VoiceSampleButton.module.css';
import { storedAudioUrl } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';

export interface MusicPreviewButtonProps {
  assetId: string;
  version: number;
  /** The track's catalog name, for the button's accessible name only. */
  name: string;
  size?: 'sm' | 'md';
}

/**
 * "Ouvir" for a music version (docs/specs/2026-11-25-music-preview.md): plays the stored track so
 * the owner can choose music by ear. Same button, same one-at-a-time playback as the voice sample.
 */
export function MusicPreviewButton(props: MusicPreviewButtonProps): ReactElement {
  // A new track starts from scratch instead of playing the previous one.
  return <MusicPreviewControl key={`${props.assetId}@${props.version}`} {...props} />;
}

function MusicPreviewControl({ assetId, version, name, size = 'sm' }: MusicPreviewButtonProps): ReactElement {
  const texts = useWebMessages().catalog.musicPreview;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio === null) return;
      audio.pause();
      releasePlayback(audio);
    };
  }, []);

  const press = (): void => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (failed) {
      setFailed(false);
      audio.load();
    }
    claimPlayback(audio);
    // A broken track reports through the element's own error event.
    audio.play().catch(() => setPlaying(false));
  };

  const label = failed ? texts.retry : playing ? texts.pause : texts.play;
  return (
    <span className={styles.sample}>
      <Button variant="secondary" size={size} aria-label={texts.namedLabel(label, name)} onClick={press}>
        {!playing && <Icon name="play-circle" size="sm" />}
        {label}
      </Button>
      {/* Instrumental track with no captions to offer; the page shows no player. */}
      <audio
        ref={audioRef}
        src={storedAudioUrl(assetId, version)}
        preload="none"
        hidden
        onPlay={() => {
          if (audioRef.current !== null) claimPlayback(audioRef.current);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (audioRef.current !== null) releasePlayback(audioRef.current);
        }}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
      />
      {failed && (
        <span role="alert" className={`caption ${styles.problem}`}>
          {texts.audioUnreadable}
        </span>
      )}
    </span>
  );
}
