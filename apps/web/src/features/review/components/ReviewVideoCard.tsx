import { Alert, Card, ErrorState, Table, VideoPlayer, shortenHash, type TableColumn, type VideoAspect } from '@studio/ui';
import { type AspectRatio } from '@studio/shared/catalog';
import { type QaSummary } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatClock } from '@/features/runs/run-labels';
import { runArtifactUrl } from '@/features/runs/runs-api';
import { FINAL_VIDEO_PATH, type ArtifactRead, type VideoAccess, type WithheldItem } from '../media-safety';
import { formatDecimal } from '../review-labels';
import { BiometricVideoPlayer } from './BiometricVideoPlayer';

interface ReviewVideoCardProps {
  runId: string;
  aspect: AspectRatio;
  video: VideoAccess;
  qa: ArtifactRead<QaSummary>;
}

const BIOMETRIC_NOTICE =
  'Este vídeo foi narrado com o clone da sua voz (material biométrico). Ele toca só nesta sessão do estúdio, sem opção de download, e não pode ser promovido ao catálogo.';
const WITHHELD_REASON =
  'O serviço local não liberou o vídeo desta execução: a sensibilidade de um ativo usado não pôde ser confirmada ou o manifesto não pôde ser lido. Por segurança, abaixo ficam só a referência e o hash de cada item.';

const withheldColumns: readonly TableColumn<WithheldItem>[] = [
  { key: 'ref', header: 'Ativo', rowHeader: true, render: (item) => <span className="mono">{item.ref}</span> },
  {
    key: 'hash',
    header: 'Hash',
    render: (item) => (item.contentHash === null ? '—' : <span className="mono" title={item.contentHash}>{shortenHash(item.contentHash)}</span>),
  },
];

/** VideoPlayer takes 16:9 and 9:16; a 1:1 recipe uses the landscape frame (no R1 recipe is 1:1). */
function playerAspect(aspect: AspectRatio): VideoAspect {
  return aspect === '9:16' ? '9:16' : '16:9';
}

function videoCaption(qa: ArtifactRead<QaSummary>): string | undefined {
  if (qa.status !== 'present') return undefined;
  const { durationMs, width, height, audio } = qa.value.metrics;
  const parts = [formatClock(durationMs), `${width}x${height}`];
  if (audio.status === 'present') parts.push(`${formatDecimal(audio.integratedLufs)} LUFS`);
  return parts.join(' · ');
}

/**
 * Card "Vídeo" (design/telas/09), driven by the api's `artifactAccess` (SPEC 0002 rev 4, section
 * 13.5): `playable` uses the shared player; `playable-biometric` uses a player with no download
 * control or link and a notice; `withheld` renders no `video` element, only refs and hashes.
 */
export function ReviewVideoCard({ runId, aspect, video, qa }: ReviewVideoCardProps): ReactElement {
  const title = `Vídeo final da execução ${runId}`;
  return (
    <Card title="Vídeo">
      {video.kind === 'playable' && (
        <VideoPlayer src={runArtifactUrl(runId, FINAL_VIDEO_PATH)} title={title} aspect={playerAspect(aspect)} caption={videoCaption(qa)} />
      )}
      {video.kind === 'playable-biometric' && (
        <div className={layout.stack}>
          <Alert variant="info" title="Vídeo com o clone da sua voz">
            {BIOMETRIC_NOTICE}
          </Alert>
          <BiometricVideoPlayer
            src={runArtifactUrl(runId, FINAL_VIDEO_PATH)}
            title={title}
            aspect={playerAspect(aspect)}
            caption={videoCaption(qa)}
          />
        </div>
      )}
      {video.kind === 'withheld' && (
        <div className={layout.stack}>
          <Alert variant="warning" title="Vídeo não exibido">
            {WITHHELD_REASON}
          </Alert>
          {video.items.length > 0 && (
            <Table caption="Material retido" columns={withheldColumns} rows={video.items} rowKey={(item) => item.ref} emptyText="Nenhum item." />
          )}
        </div>
      )}
      {video.kind === 'missing' && (
        <ErrorState
          title="O vídeo final não foi encontrado"
          description={
            <>
              Confira a pasta da execução com <code>studio doctor</code>.
            </>
          }
        />
      )}
    </Card>
  );
}
