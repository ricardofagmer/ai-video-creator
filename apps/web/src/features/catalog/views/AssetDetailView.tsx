import { Alert, Card, EmptyState, StatusBadge, VersionList, buttonClassName, formatBytes, textLinkClassName } from '@studio/ui';
import { type AssetVersionView, type ReferenceAnalysisView } from '@studio/shared/api';
import { AssetIdSchema, ComparisonIdSchema } from '@studio/shared/catalog';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { cartItemOf } from '@/features/cart/cart-item';
import { cartKindArtwork } from '@/features/cart/cart-kind-artwork';
import { CartToggleButton } from '@/features/cart/components/CartToggleButton';
import { AssetVersionDetails } from '@/features/catalog/components/AssetVersionDetails';
import { DiscontinueAssetButton } from '@/features/catalog/components/DiscontinueAssetButton';
import { SiteEmbed } from '@/features/catalog/components/SiteEmbed';
import { VideoEmbed } from '@/features/catalog/components/VideoEmbed';
import { siteLinkOf } from '@/features/catalog/site-link-draft';
import { imageLinkOf } from '@/features/catalog/image-link-draft';
import { referencePostOf } from '@/features/catalog/reference-post';
import { storedImageHref } from '@/features/catalog/stored-image';
import { AssetPurposeCard } from '@/features/catalog/components/AssetPurposeCard';
import { AssetPurposeEditor } from '@/features/catalog/components/AssetPurposeEditor';
import { ReferenceAnalysisCard } from '@/features/catalog/components/ReferenceAnalysisCard';
import { FocusHeadingOnVersionChange } from '@/features/catalog/components/FocusHeadingOnVersionChange';
import { VersionQualityCard } from '@/features/catalog/components/VersionQualityCard';
import { VersionScoresTable, versionScoresViewFrom } from '@/features/catalog/components/VersionScoresTable';
import { VersionStatusControls } from '@/features/catalog/components/VersionStatusControls';
import { formatDateTime } from '@/features/catalog/catalog-labels';
import { LICENSE_ALERT_ID, activationBlockedByLicense, statusNoticeFrom, type StatusNotice } from '@/features/catalog/status-notice';
import catalogStyles from '@/features/catalog/catalog.module.css';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { SubjectCurationsCard } from '@/features/curations/components/SubjectCurationsCard';
import { assetCurationSubject, curationBlockedText } from '@/features/curations/curation-subject';
import { LearningNoteList } from '@/features/learnings/components/LearningNoteList';
import { ActivationSummary } from '@/features/promotion/components/ActivationSummary';
import { describeApiError } from '@/features/common/api-error-text';
import { VoiceSampleButton } from '@/features/voices/components/VoiceSampleButton';
import { isVoiceVersion } from '@/features/voices/voice-asset';
import { isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export type CatalogPresentation = 'page' | 'modal';

interface AssetDetailViewProps {
  assetId: string;
  query: Record<string, string | string[] | undefined>;
  /** `modal` renders inside the catalog's dialog, which already offers the way back. */
  presentation: CatalogPresentation;
}

/** Every version of the asset, newest first; null when the asset id is unknown or malformed. */
export async function loadAssetVersions(assetId: string): Promise<AssetVersionView[] | null> {
  if (!AssetIdSchema.safeParse(assetId).success) return null;
  try {
    const page = await serverStudioClient().listAssetVersions(assetId, { limit: 100 });
    return [...page.items].sort((left, right) => right.version - left.version);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

interface InitialReferenceAnalysis {
  view: ReferenceAnalysisView | null;
  error: string | null;
}

/** Saved video references get the "Análise da IA" card (guided-creation spec section 4). */
function isVideoReference(version: AssetVersionView): boolean {
  return version.kind === 'reference' && version.details.subKind === 'video';
}

/** The analysis as the page opens; a failed read is shown in the card, which can read it again. */
async function loadReferenceAnalysis(version: AssetVersionView, t: WebMessages): Promise<InitialReferenceAnalysis> {
  try {
    return { view: await serverStudioClient().getReferenceAnalysis(version.id, version.version), error: null };
  } catch (error) {
    return { view: null, error: describeApiError(error, t) };
  }
}

/** `?versao=N`, else the active version, else the newest (design/telas/03). */
function openVersion(versions: readonly AssetVersionView[], requested: string | string[] | undefined): AssetVersionView | undefined {
  const number = typeof requested === 'string' && /^[1-9][0-9]{0,6}$/.test(requested) ? Number.parseInt(requested, 10) : null;
  return versions.find((version) => version.version === number) ?? versions.find((version) => version.status === 'active') ?? versions[0];
}

function NoticeAlert({ notice, version, t }: { notice: StatusNotice | null; version: number; t: WebMessages['catalog']['asset']['notices'] }): ReactElement | null {
  switch (notice) {
    case 'ativada':
      return <Alert variant="success">{t.activated(version)}</Alert>;
    case 'descontinuada':
      return <Alert variant="success">{t.deprecated(version)}</Alert>;
    case 'salvo':
      return <Alert variant="success">{t.saved}</Alert>;
    case 'erro':
      return <Alert variant="error">{t.error}</Alert>;
    default:
      return null;
  }
}

/** design/telas/03: `/catalogo/[assetId]`, one version's metadata plus the version history. */
export async function AssetDetailView({ assetId, query, presentation }: AssetDetailViewProps): Promise<ReactElement> {
  const versions = await loadAssetVersions(assetId);
  const current = versions === null ? undefined : openVersion(versions, query.versao);
  const { t, locale } = await getI18n();
  const asset = t.catalog.asset;

  if (versions === null || current === undefined) {
    return (
      <EmptyState
        title={asset.notFoundTitle}
        description={asset.notFoundDescription}
        action={
          <Link href="/catalogo" className={buttonClassName({ variant: 'secondary' })}>
            {asset.backToCatalog}
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
  const referencePost = referencePostOf(current);
  const imageLink = imageLinkOf(current);
  const storedImage = storedImageHref(current);
  const siteLink = siteLinkOf(current);
  const curationSubject = assetCurationSubject(current);
  const newVersionHref = `/catalogo/novo?de=${current.id}&versao=${current.version}`;
  const analysis = isVideoReference(current) ? await loadReferenceAnalysis(current, t) : null;

  const workCards = (
    <>
      {/* ADR 0012 (AP-09, AP-10): what the item is for, first among the work cards. The key carries the
          purpose fields, so an owner edit or regenerate, followed by the page refresh, starts the card
          again from the new view. */}
      <AssetPurposeCard
        key={`purpose-${current.id}@${current.version}:${current.purposeSource}:${current.purposeJob?.status ?? 'no-job'}:${current.purpose}`}
        assetId={current.id}
        version={current.version}
        initial={{ purpose: current.purpose, purposeSource: current.purposeSource, purposeJob: current.purposeJob }}
        editor={<AssetPurposeEditor assetId={current.id} version={current.version} />}
      />
      {analysis !== null && (
        <ReferenceAnalysisCard
          key={`${current.id}@${current.version}`}
          assetId={current.id}
          version={current.version}
          newVersionHref={newVersionHref}
          initialView={analysis.view}
          initialError={analysis.error}
        />
      )}
      <Card title={asset.learningsTitle} description={asset.learningsDescription}>
        <LearningNoteList notes={current.learnings} showRef={false} emptyText={asset.learningsEmpty} />
      </Card>
      {curationSubject !== null && (
        <SubjectCurationsCard
          subject={curationSubject}
          blockedText={curationBlockedText({ status: current.status, biometric: current.sensitivity === 'biometric' }, t.curations.blocked)}
        />
      )}
      {current.activation !== null && (
        <Card title={asset.activationTitle}>
          <ActivationSummary approval={current.activation} showScore />
        </Card>
      )}
      {current.status === 'active' && current.activation === null && <Alert variant="info">{asset.activatedWithoutApproval}</Alert>}
    </>
  );

  const versionCards = (
    <>
      <VersionQualityCard version={current} />
      <Card title={asset.versionsTitle}>
        <VersionList
          currentVersion={current.version}
          items={versions.map((version) => ({
            version: version.version,
            status: version.status,
            createdAtLabel: formatDateTime(version.createdAt, locale),
            contentHash: version.contentHash,
            sizeLabel: formatBytes(version.sizeBytes, locale),
            notes: version.notes === '' ? undefined : version.notes,
            link:
              version.version === current.version ? undefined : (
                <Link href={`/catalogo/${version.id}?versao=${version.version}`} className={textLinkClassName()}>
                  {asset.open}
                  <span className="visually-hidden">{asset.openVersionHidden(version.version)}</span>
                </Link>
              ),
          }))}
        />
      </Card>
      <Card title={asset.scoresTitle}>
        <VersionScoresTable versions={versions} currentVersion={current.version} view={versionScoresViewFrom(query)} />
      </Card>
    </>
  );

  return (
    <div className={layout.page}>
      <FocusHeadingOnVersionChange version={current.version} />
      <StudioHero
        variant="compact"
        eyebrow={t.common.heroEyebrows.catalog}
        glyph={cartKindArtwork[current.kind].glyph}
        back={
          presentation === 'page' ? (
            <Link href="/catalogo" className={textLinkClassName()}>
              {asset.back}
            </Link>
          ) : undefined
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
            {t.catalog.kinds[current.kind]} · <span className="mono">{`${current.id}@${current.version}`}</span>
          </>
        }
        actions={
          <>
            <CartToggleButton item={cartItemOf(current)} size="md" />
            {isVoiceVersion(current) && <VoiceSampleButton assetId={current.id} version={current.version} name={current.name} size="md" />}
            <Link href={newVersionHref} className={buttonClassName({ variant: 'secondary' })}>
              {asset.newVersion}
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
            <DiscontinueAssetButton assetId={current.id} name={current.name} size="md" afterHref="/catalogo" />
          </>
        }
      />
      <NoticeAlert notice={notice} version={current.version} t={asset.notices} />
      {/* The video first, with the metadata beside it: together they tell which post this reference is. */}
      {referencePost !== null && (
        <div className={catalogStyles.videoWithDetails}>
          <Card title={asset.referenceVideoTitle}>
            <VideoEmbed post={referencePost} title={t.catalog.linkBox.embedTitle(t.catalog.linkBox.platforms[referencePost.platform], referencePost.id)} />
          </Card>
          <AssetVersionDetails version={current} />
        </div>
      )}
      {/* The picture itself, as on its card: a saved link straight from the owner's https URL, an upload through the BFF. */}
      {referencePost === null && (imageLink !== null || storedImage !== null) && (
        <img
          className={catalogStyles.detailImage}
          src={imageLink?.href ?? storedImage ?? undefined}
          alt={current.name}
          decoding="async"
          referrerPolicy={imageLink !== null ? 'no-referrer' : undefined}
        />
      )}
      {/* A saved website, live in a sandboxed frame; the browser loads it from the owner's link, never the server. */}
      {siteLink !== null && (
        <Card title={t.catalog.siteLink.embedCardTitle}>
          <div className={catalogStyles.siteDetail}>
            <SiteEmbed href={siteLink.href} title={t.catalog.siteLink.embedTitle(siteLink.hostname)} mode="live" />
            <p className="caption">
              {t.catalog.siteLink.embedBlocked}{' '}
              <a href={siteLink.href} target="_blank" rel="noopener noreferrer" className={textLinkClassName()}>
                {t.catalog.siteLink.openSite(siteLink.hostname)}
              </a>
            </p>
          </div>
        </Card>
      )}
      {showLicenseAlert && (
        <div id={LICENSE_ALERT_ID}>
          <Alert variant="warning" title={asset.licenseAlertTitle}>
            {asset.licenseAlertBody}
          </Alert>
        </div>
      )}
      {current.sensitivity === 'biometric' && (
        <Alert variant="info">
          {asset.biometricInfo}
        </Alert>
      )}
      {referencePost === null ? (
        <div className={layout.detailColumns}>
          <div className={layout.stackLarge}>
            <AssetVersionDetails version={current} />
            {workCards}
          </div>
          <div className={layout.stackLarge}>{versionCards}</div>
        </div>
      ) : (
        // The metadata already sits beside the video, so the remaining cards flow into balanced columns.
        <div className={catalogStyles.balancedCards}>
          {workCards}
          {versionCards}
        </div>
      )}
    </div>
  );
}
