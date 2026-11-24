import type { Messages } from '@studio/ui';
import type { authPtBR } from './pt-BR';

export const authEn: Messages<typeof authPtBR> = {
  pageTitle: 'Sign in',
  facts: {
    access: { label: 'Access', value: "This Mac's passphrase" },
    files: { label: 'Files', value: 'Stay on this computer' },
    network: { label: 'Network', value: 'Only the AI providers you configure' },
  },
  chip: 'Local panel · this Mac',
  headlineBefore: 'Your AI video studio, ',
  headlineHighlight: 'running on this Mac.',
  lead: 'Catalog, recipes and runs in one panel. Nothing leaves the machine except the calls to the AI providers you configure.',
  sessionExpired: 'Your session ended. Sign in again to continue.',
  devSignInFailed: 'The development auto sign-in did not work. Check the passphrase in apps/web/.env.local or sign in below.',
  footnote: "The passphrase goes straight to the local API: it never stays in the URL, the browser's storage or the logs.",
  form: {
    eyebrow: 'Local access',
    title: 'Sign in',
    description: "Enter this Mac's passphrase.",
    passphrase: 'Passphrase',
    signingIn: 'Signing in…',
    submit: 'Sign in',
  },
  errors: {
    wrongPassphrase: 'Wrong passphrase. Try again.',
    tooManyAttempts: 'Too many attempts. Wait a moment and try again.',
    tooManyAttemptsWait: (seconds) => `Too many attempts. Wait ${seconds} s and try again.`,
    notConfigured: 'No passphrase was set on this Mac. Run the install script to set it.',
    failed: 'Could not sign in. Try again.',
  },
};
