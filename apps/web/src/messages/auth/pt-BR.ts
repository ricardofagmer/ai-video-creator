/** `/login` (design/telas/01). pt-BR is the source of truth for the group's type. */
export const authPtBR = {
  /** The page title is absolute: "Entrar · EngineOS Video Creator". */
  pageTitle: 'Entrar',
  facts: {
    access: { label: 'Acesso', value: 'Senha deste Mac' },
    files: { label: 'Arquivos', value: 'Ficam neste computador' },
    network: { label: 'Rede', value: 'Só os provedores de IA que você configurar' },
  },
  chip: 'Painel local · este Mac',
  headlineBefore: 'Seu estúdio de vídeo com IA, ',
  headlineHighlight: 'rodando neste Mac.',
  lead: 'Catálogo, presets e execuções em um só painel. Nada sai da máquina além das chamadas aos provedores de IA que você configurar.',
  sessionExpired: 'Sua sessão terminou. Entre de novo para continuar.',
  devSignInFailed: 'O login automático de desenvolvimento não funcionou. Confira a senha em apps/web/.env.local ou entre abaixo.',
  footnote: 'A senha vai direto para a API local: nunca fica na URL, no armazenamento do navegador nem nos logs.',
  form: {
    eyebrow: 'Acesso local',
    title: 'Entrar',
    description: 'Digite a senha deste Mac.',
    passphrase: 'Senha',
    signingIn: 'Entrando…',
    submit: 'Entrar',
  },
  errors: {
    wrongPassphrase: 'Senha incorreta. Tente de novo.',
    tooManyAttempts: 'Muitas tentativas. Espere um pouco e tente de novo.',
    tooManyAttemptsWait: (seconds: number): string => `Muitas tentativas. Espere ${seconds} s e tente de novo.`,
    notConfigured: 'Nenhuma senha foi definida neste Mac. Rode o script de instalação para definir a senha.',
    failed: 'Não foi possível entrar. Tente de novo.',
  },
} as const;
