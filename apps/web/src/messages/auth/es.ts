import type { Messages } from '@studio/ui';
import type { authPtBR } from './pt-BR';

export const authEs: Messages<typeof authPtBR> = {
  pageTitle: 'Entrar',
  facts: {
    access: { label: 'Acceso', value: 'Contraseña de este Mac' },
    files: { label: 'Archivos', value: 'Se quedan en esta computadora' },
    network: { label: 'Red', value: 'Solo los proveedores de IA que configures' },
  },
  chip: 'Panel local · este Mac',
  headlineBefore: 'Tu estudio de video con IA, ',
  headlineHighlight: 'funcionando en este Mac.',
  lead: 'Catálogo, presets y ejecuciones en un solo panel. Nada sale de la máquina, salvo las llamadas a los proveedores de IA que configures.',
  sessionExpired: 'Tu sesión terminó. Vuelve a entrar para continuar.',
  devSignInFailed: 'El inicio de sesión automático de desarrollo no funcionó. Revisa la contraseña en apps/web/.env.local o entra abajo.',
  footnote: 'La contraseña va directo a la API local: nunca queda en la URL, en el almacenamiento del navegador ni en los registros.',
  form: {
    eyebrow: 'Acceso local',
    title: 'Iniciar sesión',
    description: 'Escribe la contraseña de este Mac.',
    passphrase: 'Contraseña',
    signingIn: 'Entrando…',
    submit: 'Entrar',
  },
  errors: {
    wrongPassphrase: 'Contraseña incorrecta. Inténtalo de nuevo.',
    tooManyAttempts: 'Demasiados intentos. Espera un poco e inténtalo de nuevo.',
    tooManyAttemptsWait: (seconds) => `Demasiados intentos. Espera ${seconds} s e inténtalo de nuevo.`,
    notConfigured: 'No se definió ninguna contraseña en este Mac. Ejecuta el script de instalación para definirla.',
    failed: 'No se pudo entrar. Inténtalo de nuevo.',
  },
};
