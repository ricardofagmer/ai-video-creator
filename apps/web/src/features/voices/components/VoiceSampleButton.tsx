'use client';

import { type Language } from '@studio/shared/recipes';
import { Badge, Button, Icon, useI18n } from '@studio/ui';
import { type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { useVoiceSample } from '../hooks/useVoiceSample';
import { sampleLanguageFor } from '../voice-asset';
import { type VoiceSamplePhase, type VoiceSampleProblem } from '../voice-sample-state';
import styles from './VoiceSampleButton.module.css';

export interface VoiceSampleButtonProps {
  assetId: string;
  version: number;
  /** The voice's catalog name, for the button's accessible name only. */
  name: string;
  /** The recipe's language when known; otherwise the UI language decides (guided-creation spec section 2). */
  language?: Language | null;
  size?: 'sm' | 'md';
}

/**
 * "Ouvir": asks the api for a short fixed sentence in this voice and plays it, so the owner can
 * choose a voice by ear. Shows nothing about the voice beyond the clip itself: biometric voices
 * keep showing name and ref only. One sample plays at a time on the page.
 */
export function VoiceSampleButton({ language, ...props }: VoiceSampleButtonProps): ReactElement {
  const { locale } = useI18n();
  const sampleLanguage = sampleLanguageFor(locale, language);
  // A new voice or language starts from scratch instead of playing the previous clip.
  return <VoiceSampleControl key={`${props.assetId}@${props.version}:${sampleLanguage}`} {...props} language={sampleLanguage} />;
}

interface VoiceSampleControlProps extends Omit<VoiceSampleButtonProps, 'language'> {
  language: Language;
}

function VoiceSampleControl({ assetId, version, name, language, size = 'sm' }: VoiceSampleControlProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.voiceSample;
  const { phase, playing, press, audio } = useVoiceSample({ assetId, version, language });
  const problem = phase.kind === 'failed' ? phase.problem : null;
  const label = buttonLabel(phase, playing, t);
  return (
    <span className={styles.sample}>
      <Button
        variant="secondary"
        size={size}
        loading={phase.kind === 'generating'}
        loadingLabel={texts.generating}
        aria-label={texts.namedLabel(label, name)}
        onClick={press}
      >
        {!playing && <Icon name="play-circle" size="sm" />}
        {label}
      </Button>
      {phase.kind === 'ready' && phase.mock && <Badge tone="info">{texts.mock}</Badge>}
      {/* Spoken sample of a fixed sentence with no captions to offer; the page shows no player. */}
      <audio
        ref={audio.ref}
        src={audio.src}
        preload="none"
        hidden
        onPlay={audio.onPlay}
        onPause={audio.onPause}
        onEnded={audio.onEnded}
        onError={audio.onError}
      />
      {problem !== null && (
        <span role="alert" className={`caption ${styles.problem}`}>
          {problemText(problem, t)}
        </span>
      )}
    </span>
  );
}

function buttonLabel(phase: VoiceSamplePhase, playing: boolean, t: WebMessages): string {
  const texts = t.catalog.voiceSample;
  if (phase.kind === 'failed') return texts.retry;
  if (phase.kind === 'ready' && playing) return texts.pause;
  return texts.play;
}

/** One plain sentence per reason the clip cannot play. */
function problemText(problem: VoiceSampleProblem, t: WebMessages): string {
  const texts = t.catalog.voiceSample;
  switch (problem.kind) {
    case 'job':
      return problem.code === null ? texts.noSample : t.catalog.assetJobErrors[problem.code];
    case 'waited-too-long':
      return texts.waitedTooLong;
    case 'audio':
      return texts.audioUnreadable;
    case 'api':
      return describeApiError(problem.error, t);
  }
}
