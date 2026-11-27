import { Alert } from '@studio/ui';
import { ConnectionResultQuerySchema, type ConnectionResultQuery } from '@studio/shared/api';
import type { Metadata } from 'next';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { ConnectionResultNotice } from '@/features/platforms/components/ConnectionResultNotice';
import { PlatformCard } from '@/features/platforms/components/PlatformCard';
import { loadPlatforms } from '@/features/platforms/platforms.server';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.platforms.page.title };
}
export const dynamic = 'force-dynamic';

interface AccountsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** `?resultado=...&motivo=...` after the api's callback; anything else shows no notice. */
function connectionResult(query: Record<string, string | string[] | undefined>): ConnectionResultQuery | null {
  const picked: Record<string, string> = {};
  if (typeof query.resultado === 'string') picked.resultado = query.resultado;
  if (typeof query.motivo === 'string') picked.motivo = query.motivo;
  const parsed = ConnectionResultQuerySchema.safeParse(picked);
  return parsed.success ? parsed.data : null;
}

/**
 * SPEC 0007 section 5.9: `/contas`, one card per platform (OD2). A pending platform never blocks
 * the others, and the R3 CSV and form import stay available for every platform in every state.
 */
export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const [platforms, query] = await Promise.all([loadPlatforms(), searchParams]);
  const result = connectionResult(query);
  const { t } = await getI18n();
  const texts = t.platforms.page;

  return (
    <div className={layout.page}>
      <StudioHero
        eyebrow={t.common.heroEyebrows.accounts}
        glyph="user"
        title={texts.title}
        description={texts.description}
        facts={
          platforms.status === 'failed'
            ? []
            : [
                texts.platformCount(platforms.platforms.length),
                texts.connectedCount(platforms.platforms.filter((view) => view.connectedAt !== null).length),
              ]
        }
      />
      {result !== null && <ConnectionResultNotice result={result} />}
      {platforms.status === 'failed' ? (
        <Alert variant="warning">{texts.loadFailed(platforms.message)}</Alert>
      ) : (
        <ul className={layout.cardGrid}>
          {platforms.platforms.map((view) => (
            <li key={view.platform}>
              <PlatformCard view={view} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
