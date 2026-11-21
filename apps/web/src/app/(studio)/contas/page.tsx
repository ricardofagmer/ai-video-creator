import { Alert, PageHeader } from '@studio/ui';
import { ConnectionResultQuerySchema, type ConnectionResultQuery } from '@studio/shared/api';
import type { Metadata } from 'next';
import layout from '@/features/common/layout.module.css';
import { ConnectionResultNotice } from '@/features/platforms/components/ConnectionResultNotice';
import { PlatformCard } from '@/features/platforms/components/PlatformCard';
import { loadPlatforms } from '@/features/platforms/platforms.server';

export const metadata: Metadata = { title: 'Contas' };
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'As suas contas no YouTube, Instagram e TikTok. Cada plataforma é liberada por você, separadamente, depois que ela aprovar o aplicativo; o estúdio só publica quando você clica em Publicar numa execução aprovada.';

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

  return (
    <div className={layout.page}>
      <PageHeader title="Contas" description={DESCRIPTION} />
      {result !== null && <ConnectionResultNotice result={result} />}
      {platforms.status === 'failed' ? (
        <Alert variant="warning">{`Não foi possível carregar as contas. ${platforms.message}`}</Alert>
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
