'use client';

import { Alert, Badge, Button, DescriptionList, formatBytes, shortenHash, textLinkClassName } from '@studio/ui';
import { type PublishAttemptView, type PublishPlatformView, type PublishRequest, type RunPublishView } from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import { isOpenPublishState } from '@studio/shared/platforms';
import Link from 'next/link';
import { useRef, useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { describePlatformApiError, rev7ReasonText } from '@/features/common/platform-error-text';
import { ApiRequestError } from '@/lib/api';
import { MOCK_MODE_TEXT, capabilityStatusBadge } from '@/features/platforms/platform-labels';
import { newIdempotencyKey } from '../idempotency-key';
import { buildPublishRequest, initialPublishDraft, type PublishDraft, type PublishDraftErrors } from '../publish-form-model';
import { publishButtonLabel } from '../publish-labels';
import { browserPublishingApi } from '../publishing-api';
import styles from '../publishing.module.css';
import { BiometricAssetList } from './BiometricAssetList';
import { PublishAttemptStatus } from './PublishAttemptStatus';
import { PublishMetadataFields, publishFieldId } from './PublishMetadataFields';

interface PublishPlatformTabProps {
  runId: string;
  runTitle: string;
  view: RunPublishView;
  platform: PublishPlatformView;
  accountLabel: string | null;
  onAttempt: (attempt: PublishAttemptView) => void;
}

interface KeyState {
  /** Created when the dialog opens (this panel mounts with it); repeated only on a resend of the same form. */
  key: string;
  /** The attempt the key created, once the api answered. */
  sentAttemptId: string | null;
  /** What was last sent with `key`; null until the first send. */
  sentFingerprint: string | null;
}

/**
 * Every field the api compares for one key (run, platform, metadata, biometric refs, artifact):
 * the api refuses a key reused with other data (409 `publish-idempotency-key-reused`, review C9).
 */
function requestFingerprint(options: { runId: string; platform: Platform; request: PublishRequest }): string {
  const { metadata, biometricRefs, artifactSha256 } = options.request;
  return JSON.stringify([options.runId, options.platform, metadata, biometricRefs, artifactSha256]);
}

function isKeyReusedError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.reason === 'publish-idempotency-key-reused';
}

const fieldOrder: readonly (keyof PublishDraftErrors)[] = ['title', 'caption', 'tags', 'visibility'];

/**
 * One platform tab of the publish dialog (SPEC 0007 section 5.4): the video, its size and the
 * connected account's label, the metadata, the biometric assets named (OD4), the mock banner and
 * one button "Publicar em {plataforma}", disabled while the status is not `connected`. The button
 * is disabled from the first click; a new attempt after a terminal failure, or after any change of
 * the sent fields, gets a new key.
 */
export function PublishPlatformTab({ runId, runTitle, view, platform, accountLabel, onAttempt }: PublishPlatformTabProps): ReactElement {
  const platformId = platform.platform;
  const [draft, setDraft] = useState<PublishDraft>(() =>
    initialPublishDraft({ runTitle, hasBiometricAssets: view.biometricAssets.length > 0 }),
  );
  const [errors, setErrors] = useState<PublishDraftErrors>({});
  const [keyState, setKeyState] = useState<KeyState>(() => ({ key: newIdempotencyKey(), sentAttemptId: null, sentFingerprint: null }));
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const latest = view.attempts.find((attempt) => attempt.platform === platformId) ?? null;
  const attemptOpen = latest !== null && isOpenPublishState(latest.state);
  const badge = capabilityStatusBadge(platform.status);
  const blocked =
    !view.approved || view.artifact === null || platform.status !== 'connected' || !platform.eligible || platform.publicationId !== null || attemptOpen;

  async function publish(): Promise<void> {
    if (sendingRef.current || blocked || view.artifact === null) return;
    const built = buildPublishRequest({
      platform: platformId,
      draft,
      allowedVisibilities: platform.allowedVisibilities,
      idempotencyKey: keyState.key,
      artifactSha256: view.artifact.sha256,
      biometricRefs: view.biometricAssets.map((asset) => asset.ref),
    });
    if (built.status === 'invalid') {
      setErrors(built.errors);
      const first = fieldOrder.find((field) => built.errors[field] !== undefined);
      if (first !== undefined) document.getElementById(publishFieldId(platformId, first))?.focus();
      return;
    }
    setErrors({});
    const fingerprint = requestFingerprint({ runId, platform: platformId, request: built.request });
    const sent = view.attempts.find((attempt) => attempt.attemptId === keyState.sentAttemptId);
    // Section 5.4: a new click after a terminal attempt is a new attempt with a new key. Review C9:
    // a changed form is a new request too; only a resend of the same form repeats the key.
    const terminal = sent !== undefined && !isOpenPublishState(sent.state);
    const changed = keyState.sentFingerprint !== null && keyState.sentFingerprint !== fingerprint;
    const key = terminal || changed ? newIdempotencyKey() : keyState.key;
    const request: PublishRequest = { ...built.request, idempotencyKey: key };
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const attempt = await browserPublishingApi.requestPublish({ runId, platform: platformId, request });
      setKeyState({ key, sentAttemptId: attempt.attemptId, sentFingerprint: fingerprint });
      onAttempt(attempt);
    } catch (error) {
      if (isKeyReusedError(error)) {
        // The api holds this key with other data; the next click starts over with a fresh key.
        setKeyState({ key: newIdempotencyKey(), sentAttemptId: null, sentFingerprint: null });
      } else {
        // The same key is kept: if the api stored the attempt before the answer was lost, a resend returns it.
        const sentAttemptId = key === keyState.key ? keyState.sentAttemptId : null;
        setKeyState({ key, sentAttemptId, sentFingerprint: fingerprint });
      }
      setSendError(describePlatformApiError(error, { platform: platformId, mode: platform.mode }));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className={layout.stack}>
      {platform.mode === 'mock' && <Alert variant="info">{MOCK_MODE_TEXT}</Alert>}
      <p className={styles.attemptLine}>
        <span className="label">Conta</span>
        <Badge tone={badge.tone} dot>
          {badge.label}
        </Badge>
        {platform.status !== 'connected' && (
          <Link href="/contas" className={textLinkClassName()}>
            Abrir Contas
          </Link>
        )}
      </p>
      <DescriptionList
        items={[
          { term: 'Vídeo', description: 'final.mp4', mono: true },
          { term: 'Tamanho', description: view.artifact === null ? '—' : formatBytes(view.artifact.sizeBytes) },
          { term: 'Hash', description: view.artifact === null ? '—' : shortenHash(view.artifact.sha256), mono: true },
          { term: 'Conta conectada', description: accountLabel ?? '—' },
        ]}
      />
      {view.artifact === null && <Alert variant="warning">{rev7ReasonText('publish-artifact-missing', { platform: platformId })}</Alert>}
      <PublishMetadataFields
        platform={platformId}
        draft={draft}
        errors={errors}
        allowedVisibilities={platform.allowedVisibilities}
        disabled={sending}
        onChange={setDraft}
      />
      <BiometricAssetList platform={platformId} assets={view.biometricAssets} />
      {latest !== null && <PublishAttemptStatus attempt={latest} />}
      {platform.refusal !== null && !attemptOpen && (
        <Alert variant="info">{rev7ReasonText(platform.refusal, { platform: platformId, mode: platform.mode })}</Alert>
      )}
      {sendError !== null && <Alert variant="error">{sendError}</Alert>}
      <div className={styles.actions}>
        <Button variant="primary" loading={sending} loadingLabel="Enviando o pedido…" disabled={blocked} onClick={() => void publish()}>
          {publishButtonLabel(platformId)}
        </Button>
      </div>
    </div>
  );
}
