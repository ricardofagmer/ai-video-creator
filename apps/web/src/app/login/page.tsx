import { Alert, Logo, THEME_COOKIE_NAME, ThemeToggle, parseThemePreference } from '@studio/ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/features/auth/LoginForm';
import { API_UNREACHABLE_TEXT } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { ApiUnreachableError } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';

export const metadata: Metadata = { title: { absolute: 'Entrar · Video Studio' } };

type SessionState = 'authenticated' | 'anonymous' | 'api-unreachable';

async function currentSession(): Promise<SessionState> {
  try {
    await serverStudioClient('throw').session();
    return 'authenticated';
  } catch (error) {
    return error instanceof ApiUnreachableError ? 'api-unreachable' : 'anonymous';
  }
}

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** design/telas/01: `/login`, the only public page. */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const state = await currentSession();
  if (state === 'authenticated') redirect('/execucoes');
  const { motivo } = await searchParams;
  const themePreference = parseThemePreference((await cookies()).get(THEME_COOKIE_NAME)?.value);
  return (
    <main id="conteudo" className={layout.authPage}>
      <Logo />
      <ThemeToggle initialPreference={themePreference} />
      <div className={`${layout.authCard} ${layout.stack}`}>
        {state === 'api-unreachable' && <Alert variant="error">{API_UNREACHABLE_TEXT}</Alert>}
        {motivo === 'sessao-expirada' && <Alert variant="info">Sua sessão terminou. Entre de novo para continuar.</Alert>}
        <LoginForm />
      </div>
    </main>
  );
}
