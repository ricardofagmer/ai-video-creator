import { Alert, VideoPlayer, type VideoAspect } from '@studio/ui';
import { type ComparisonArmView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { BiometricVideoPlayer } from '@/features/review/components/BiometricVideoPlayer';
import { FINAL_VIDEO_PATH } from '@/features/review/media-safety';
import { runArtifactUrl } from '@/features/runs/runs-api';
import { type WebMessages } from '@/messages';
import { finishedRunStatuses } from '../comparison-labels';

interface ComparisonArmPlayerProps {
  arm: ComparisonArmView;
  /** False when the comparison is `incomplete`: a `rejected` arm may have no `final.mp4` then. */
  rejectedHasVideo: boolean;
  aspect: VideoAspect;
  t: WebMessages;
}

/**
 * One arm's final video, driven by the api's `artifactAccess` exactly as the review screen
 * (SPEC 0002 rev 4, section 13.5): `playable` uses the shared player; `playable-biometric` the
 * player with no download control and a notice; `withheld` renders no `video` element at all.
 */
export function ComparisonArmPlayer({ arm, rejectedHasVideo, aspect, t }: ComparisonArmPlayerProps): ReactElement {
  const texts = t.curations.comparisons.player;
  const finished = finishedRunStatuses.includes(arm.status) && (arm.status !== 'rejected' || rejectedHasVideo);
  if (!finished) return <p className="caption">{texts.notFinished}</p>;
  const title = t.runs.review.video.playerTitle(arm.runId);
  if (arm.artifactAccess === 'withheld') {
    return (
      <Alert variant="warning" title={texts.withheldTitle}>
        {texts.withheld}
      </Alert>
    );
  }
  if (arm.artifactAccess === 'playable-biometric') {
    return (
      <div className={layout.stack}>
        <Alert variant="info" title={texts.biometricTitle}>
          {texts.biometric}
        </Alert>
        <BiometricVideoPlayer src={runArtifactUrl(arm.runId, FINAL_VIDEO_PATH)} title={title} aspect={aspect} />
      </div>
    );
  }
  return <VideoPlayer src={runArtifactUrl(arm.runId, FINAL_VIDEO_PATH)} title={title} aspect={aspect} />;
}
