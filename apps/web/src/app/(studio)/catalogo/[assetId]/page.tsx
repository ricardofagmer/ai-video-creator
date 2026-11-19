import { Alert, Card, EmptyState, PageHeader, StatusBadge, VersionList, buttonClassName, formatBytes, textLinkClassName } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { AssetIdSchema, ComparisonIdSchema } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AssetVersionDetails } from '@/features/catalog/components/AssetVersionDetails';
import { FocusHeadingOnVersionChange } from '@/features/catalog/components/FocusHeadingOnVersionChange';
import { VersionQualityCard } from '@/features/catalog/components/VersionQualityCard';
import { VersionScoresTable, versionScoresViewFrom } from '@/features/catalog/components/VersionScoresTable';
import { VersionStatusControls } from '@/features/catalog/components/VersionStatusControls';
import { assetKindLabels, formatDateTime } from '@/features/catalog/catalog-labels';
import { LICENSE_ALERT_ID, activationBlockedByLicense, statusNoticeFrom, type StatusNotice } from '@/features/catalog/status-notice';
import layout from '@/features/common/layout.module.css';
import { SubjectCurationsCard } from '@/features/curations/components/SubjectCurationsCard';
import { assetCurationSubject, curationBlockedText } from '@/features/curations/curation-subject';
import { LearningNoteList } from '@/features/learnings/components/LearningNoteList';
import { ActivationSummary } from '@/features/promotion/components/ActivationSummary';
import { isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';

interface AssetPageProps {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Every version of the asset, newest first; null when the asset id is unknown or malformed. */
async function loadVersions(assetId: string): Promise<AssetVersionView[] | null> {
  if (!AssetIdSchema.safeParse(assetId).success) return null;
  try {
    const page = await serverStudioClient().listAssetVersions(assetId, { limit: 100 });
    return [...page.items].sort((left, right) => right.version - left.version);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** `?versao=N`, else the active version, else the newest (design/telas/03). */
function openVersion(versions: readonly AssetVersionView[], requested: string | string[] | undefined): AssetVersionView | undefined {
  const number = typeof requested === 'string' && /^[1-9][0-9]{0,6}$/.test(requested) ? Number.parseInt(requested, 10) : null;
  return versions.find((version) => version.version === number) ?? versions.find((version) => version.status === 'active') ?? versions[0];
}

export async function generateMetadata({ params }: AssetPageProps): Promise<Metadata> {
  const { assetId } = await params;
  const versions = await loadVersions(assetId);
  const name = versions?.[0]?.name;
  return { title: name === undefined ? 'Catálogo' : `${name} · Catálogo` };
}

function NoticeAlert({ notice, version }: { notice: StatusNotice | null; version: number }) {
  switch (notice) {
    case 'ativada':
      return <Alert variant="success">Versão v{version} ativada.</Alert>;
    case 'descontinuada':
      return <Alert variant="success">Versão v{version} descontinuada.</Alert>;
    case 'salvo':
      return <Alert variant="success">Ativo salvo como rascunho.</Alert>;
    case 'erro':
      return <Alert variant="error">Não foi possível mudar o status. Tente de novo.</Alert>;
    default:
      return null;
  }
}

/** design/telas/03: `/catalogo/[assetId]`, one version's metadata plus the version history. */
export default async function AssetPage({ params, searchParams }: AssetPageProps) {
  const { assetId } = await params;
  const query = await searchParams;
  const versions = await loadVersions(assetId);
  const current = versions === null ? undefined : openVersion(versions, query.versao);

  if (versions === null || current === undefined) {
    return (
      <EmptyState
        title="Ativo não encontrado"
        description="Ele pode ter sido digitado errado no endereço."
        action={
          <Link href="/catalogo" className={buttonClassName({ variant: 'secondary' })}>
            Voltar ao catálogo
          </Link>
        }
      />
    );
  }

  const notice = statusNoticeFrom(query.aviso);
  const blocked = activationBlockedByLicense(current);
  // `?comparacao=` from a comparison page: offered as optional evidence in the promotion dialog.
  const comparison = ComparisonIdSchema.safeParse(typeof query.comparacao === 'string' ? query.comparacao : '');
  const activeLearnings = current.learnings.filter((note) => note.status === 'active').length;
  const showLicenseAlert = (blocked && current.status !== 'active') || notice === 'licenca';
  const curationSubject = assetCurationSubject(current);

  return (
    <div className={layout.page}>
      <FocusHeadingOnVersionChange version={current.version} />
      <PageHeader
        back={
          <Link href="/catalogo" className={textLinkClassName()}>
            ← Catálogo
          </Link>
        }
        title={current.name}
        meta={
          <>
            <StatusBadge kind="asset" status={current.status} />
            {current.sensitivity !== 'normal' && <StatusBadge kind="sensitivity" status={current.sensitivity} />}
          </>
        }
        description={
          <>
            {assetKindLabels[current.kind]} · <span className="mono">{`${current.id}@${current.version}`}</span>
          </>
        }
        actions={
          <>
            <Link href={`/catalogo/novo?de=${current.id}&versao=${current.version}`} className={buttonClassName({ variant: 'secondary' })}>
              Nova versão
            </Link>
            <VersionStatusControls
              assetId={current.id}
              version={current.version}
              status={current.status}
              activationBlocked={blocked}
              quality={{
                qualityScore: current.qualityScore,
                qualitySampleSize: current.qualitySampleSize,
                qualityPlatformSampleSize: current.qualityPlatformSampleSize,
              }}
              activeLearnings={activeLearnings}
              evidenceComparisonId={comparison.success ? comparison.data : null}
            />
          </>
        }
      />
      <NoticeAlert notice={notice} version={current.version} />
      {showLicenseAlert && (
        <div id={LICENSE_ALERT_ID}>
          <Alert variant="warning" title="Licença ou procedência faltando">
            Um ativo de terceiros só pode ficar ativo com licença e procedência preenchidas. Crie uma nova versão com esses dados.
          </Alert>
        </div>
      )}
      {current.sensitivity === 'biometric' && (
        <Alert variant="info">
          Este ativo está registrado por referência. O arquivo fica no caminho original e não é copiado para o catálogo.
        </Alert>
      )}
      <div className={layout.detailColumns}>
        <div className={layout.stackLarge}>
          <AssetVersionDetails version={current} />
          <Card
            title="Aprendizados"
            description="Notas salvas a partir de execuções revisadas. Entram nos briefings das próximas execuções que usarem esta versão."
          >
            <LearningNoteList notes={current.learnings} showRef={false} emptyText="Nenhum aprendizado nesta versão." />
          </Card>
          {curationSubject !== null && (
            <SubjectCurationsCard
              subject={curationSubject}
              blockedText={curationBlockedText({ status: current.status, biometric: current.sensitivity === 'biometric' })}
            />
          )}
          {current.activation !== null && (
            <Card title="Aprovação de ativação">
              <ActivationSummary approval={current.activation} showScore />
            </Card>
          )}
          {current.status === 'active' && current.activation === null && (
            <Alert variant="info">Esta versão foi ativada antes do registro de aprovações e não tem uma aprovação registrada.</Alert>
          )}
        </div>
        <div className={layout.stackLarge}>
          <VersionQualityCard version={current} />
          <Card title="Versões">
            <VersionList
              currentVersion={current.version}
              items={versions.map((version) => ({
                version: version.version,
                status: version.status,
                createdAtLabel: formatDateTime(version.createdAt),
                contentHash: version.contentHash,
                sizeLabel: formatBytes(version.sizeBytes),
                notes: version.notes === '' ? undefined : version.notes,
                link:
                  version.version === current.version ? undefined : (
                    <Link href={`/catalogo/${version.id}?versao=${version.version}`} className={textLinkClassName()}>
                      Abrir<span className="visually-hidden"> a versão v{version.version}</span>
                    </Link>
                  ),
              }))}
            />
          </Card>
          <Card title="Notas das versões">
            <VersionScoresTable versions={versions} currentVersion={current.version} view={versionScoresViewFrom(query)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
