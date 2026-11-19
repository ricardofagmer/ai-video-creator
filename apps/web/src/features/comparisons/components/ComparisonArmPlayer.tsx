import { Alert, VideoPlayer, type VideoAspect } from '@studio/ui';
import { type ComparisonArmView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { BiometricVideoPlayer } from '@/features/review/components/BiometricVideoPlayer';
import { FINAL_VIDEO_PATH } from '@/features/review/media-safety';
import { runArtifactUrl } from '@/features/runs/runs-api';
import { finishedRunStatuses } from '../comparison-labels';

const BIOMETRIC_NOTICE =
  'Este vídeo foi narrado com o clone da sua voz (material biométrico). Ele toca só nesta sessão do estúdio, sem opção de download.';
const WITHHELD_NOTICE =
  'O serviço local não liberou o vídeo desta execução: a sensibilidade de um ativo usado não pôde ser confirmada ou o manifesto não pôde ser lido.';

interface ComparisonArmPlayerProps {
  arm: ComparisonArmView;
  /** False when the comparison is `incomplete`: a `rejected` arm may have no `final.mp4` then. */
  rejectedHasVideo: boolean;
  aspect: VideoAspect;
}

/**
 * One arm's final video, driven by the api's `artifactAccess` exactly as the review screen
 * (SPEC 0002 rev 4, section 13.5): `playable` uses the shared player; `playable-biometric` the
 * player with no download control and a notice; `withheld` renders no `video` element at all.
 */
export function ComparisonArmPlayer({ arm, rejectedHasVideo, aspect }: ComparisonArmPlayerProps): ReactElement {
  const finished = finishedRunStatuses.includes(arm.status) && (arm.status !== 'rejected' || rejectedHasVideo);
  if (!finished) return <p className="caption">O vídeo aparece aqui quando esta execução terminar.</p>;
  const title = `Vídeo final da execução ${arm.runId}`;
  if (arm.artifactAccess === 'withheld') {
    return (
      <Alert variant="warning" title="Vídeo não exibido">
        {WITHHELD_NOTICE}
      </Alert>
    );
  }
  if (arm.artifactAccess === 'playable-biometric') {
    return (
      <div className={layout.stack}>
        <Alert variant="info" title="Vídeo com o clone da sua voz">
          {BIOMETRIC_NOTICE}
        </Alert>
        <BiometricVideoPlayer src={runArtifactUrl(arm.runId, FINAL_VIDEO_PATH)} title={title} aspect={aspect} />
      </div>
    );
  }
  return <VideoPlayer src={runArtifactUrl(arm.runId, FINAL_VIDEO_PATH)} title={title} aspect={aspect} />;
}
