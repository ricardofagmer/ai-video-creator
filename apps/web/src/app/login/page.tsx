import { Alert, Logo, THEME_COOKIE_NAME, ThemeToggle, parseThemePreference } from '@studio/ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEV_AUTO_LOGIN_FAILED_REASON, DEV_AUTO_LOGIN_PATH, devAutoLoginEnabled } from '@/features/auth/dev-auto-login';
import { LoginForm } from '@/features/auth/LoginForm';
import styles from '@/features/auth/login.module.css';
import { apiUnreachableText } from '@/features/common/api-error-text';
import { LanguageControl } from '@/features/shell/LanguageControl';
import { ApiUnreachableError } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { absolute: `${t.auth.pageTitle} · ${t.app.productName}` } };
}

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

/** design/telas/01: `/login`, the only public page, in the fagmertech landing layout. */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const state = await currentSession();
  if (state === 'authenticated') redirect('/execucoes');
  const { motivo, manual } = await searchParams;
  // Any `motivo` (a failed dev sign-in, an expired session) stops it, so it can never loop.
  if (state === 'anonymous' && motivo === undefined && manual === undefined && devAutoLoginEnabled()) {
    redirect(DEV_AUTO_LOGIN_PATH);
  }
  const devSignInFailed = process.env.NODE_ENV === 'development' && motivo === DEV_AUTO_LOGIN_FAILED_REASON;
  const themePreference = parseThemePreference((await cookies()).get(THEME_COOKIE_NAME)?.value);
  const apiUnreachable = state === 'api-unreachable';
  const { t } = await getI18n();
  const texts = t.auth;
  /** What the page can truthfully promise; mirrors the README. */
  const facts = [texts.facts.access, texts.facts.files, texts.facts.network];
  return (
    <div className={styles.page}>
      <div className={styles.aurora} aria-hidden="true" />
      <header className={styles.topBar}>
        <Logo />
        <div className={styles.topBarControls}>
          <LanguageControl />
          <ThemeToggle initialPreference={themePreference} />
        </div>
      </header>
      <main id="conteudo" className={styles.main}>
        <div className={styles.hero}>
          <div className={styles.intro}>
            {/* Brand kit v1 banner, one per theme; the CSS module shows the one that matches. */}
            <img src="/brand/engineos-banner-light.png" alt="" aria-hidden="true" width={681} height={145} className={`${styles.banner} ${styles.bannerLight}`} />
            <img src="/brand/engineos-banner-dark.png" alt="" aria-hidden="true" width={743} height={145} className={`${styles.banner} ${styles.bannerDark}`} />
            <p className={styles.chip}>
              <span className={apiUnreachable ? `${styles.led} ${styles.ledOffline}` : styles.led} aria-hidden="true" />
              {texts.chip}
            </p>
            <p className={styles.headline}>
              {texts.headlineBefore}
              <span className={styles.gradientText}>{texts.headlineHighlight}</span>
            </p>
            <p className={styles.lead}>
              {texts.lead}
            </p>
          </div>
          <div className={styles.cardColumn}>
            {apiUnreachable && <Alert variant="error">{apiUnreachableText(t)}</Alert>}
            {motivo === 'sessao-expirada' && <Alert variant="info">{texts.sessionExpired}</Alert>}
            {devSignInFailed && (
              <Alert variant="warning">{texts.devSignInFailed}</Alert>
            )}
            <div className={styles.cardFrame}>
              <LoginForm />
            </div>
            <p className={styles.footnote}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              {texts.footnote}
            </p>
          </div>
          <dl className={styles.facts}>
            {facts.map((fact) => (
              <div key={fact.label} className={styles.fact}>
                <dt className={styles.factLabel}>{fact.label}</dt>
                <dd className={styles.factValue}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>
    </div>
  );
}
