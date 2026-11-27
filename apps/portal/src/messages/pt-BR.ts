/**
 * Texts of the portal. pt-BR is the source of truth for `PortalMessages`; es and en must match
 * its shape. Gatekeeper and browser copy follows vetting 0006 sections 2 and 3 (never Control-click).
 */
export const portalPtBR = {
  header: {
    tagline: 'Baixe o studio e acompanhe a instalação neste computador.',
    languageLabel: 'Idioma',
  },
  detection: {
    heading: 'Studio neste computador',
    checking: 'Procurando o studio neste computador…',
    checkAgain: 'Verificar de novo',
    openStudio: 'Abrir o studio',
    loopbackBlocked: {
      title: 'Este navegador não deixa a página conversar com o studio',
      body: 'O Safari bloqueia, por projeto, pedidos de uma página da internet para apps deste computador. Nada está errado: abra o studio pelo link abaixo, ou use o Chrome, o Edge ou o Firefox para ver a versão e o estado aqui.',
    },
    permissionPrompt: {
      title: 'Permita o acesso aos apps deste computador',
      body: 'O navegador está perguntando se esta página pode falar com apps deste computador. Escolha Permitir para ver o estado do studio. A página só fala com 127.0.0.1, o próprio computador.',
    },
    permissionDenied: {
      title: 'O acesso aos apps deste computador está bloqueado',
      body: 'Clique no ícone de configurações do site, à esquerda do endereço, mude "Rede de loopback" (ou "Apps neste dispositivo") para Permitir e verifique de novo.',
    },
    notInstalled: {
      title: 'Studio não encontrado neste computador',
      body: 'Baixe o instalador abaixo. Se o studio já está instalado, abra o app e verifique de novo. Se o navegador perguntou sobre apps deste computador, escolha Permitir.',
    },
    unpaired: {
      title: 'Studio instalado',
      body: 'Para ver o estado de cada parte, conecte esta página: no menu do studio, escolha "Conectar ao portal".',
      pairing: 'Conectando esta página ao studio…',
      rejected: 'O código de conexão expirou ou já foi usado. No menu do studio, escolha "Conectar ao portal" de novo.',
    },
    paired: {
      title: 'Studio instalado e conectado',
      waitingStatus: 'Lendo o estado das partes…',
      componentsHeading: 'Partes do studio',
      setupPending: 'A configuração inicial ainda não terminou. Abra o studio para concluir.',
    },
    unknownContract: {
      title: 'Atualize o studio',
      body: 'O studio deste computador respondeu num formato que esta página não conhece. Baixe a versão mais recente abaixo.',
    },
    facts: {
      version: 'Versão',
      platform: 'Plataforma',
      checkedAt: 'Verificado em',
    },
    components: {
      api: 'Serviço local',
      web: 'Interface',
      watcher: 'Executor',
      database: 'Banco de dados',
      ffmpeg: 'FFmpeg',
      searchModel: 'Modelo de busca (opcional)',
      captureBrowser: 'Navegador de captura (opcional)',
      dataHome: 'Pasta de dados',
    },
    componentStates: {
      ok: 'Funcionando',
      missing: 'Faltando',
      stopped: 'Parado',
      degraded: 'Com problemas',
      'not-installed': 'Não instalado',
    },
    platforms: {
      'darwin-arm64': 'macOS (Apple Silicon)',
      'win32-x64': 'Windows (x64)',
    },
  },
  update: {
    title: 'Atualização disponível',
    body: (installed: string, latest: string) => `Você tem a versão ${installed}. A versão ${latest} está disponível.`,
    download: 'Baixar a atualização',
  },
  downloads: {
    heading: 'Baixar',
    loading: 'Lendo a versão mais recente…',
    notConfigured: {
      title: 'Endereço das versões não configurado',
      body: 'Esta publicação do portal não sabe onde ler a versão mais recente. Quem mantém o portal precisa definir o endereço do latest.json.',
    },
    failed: {
      title: 'Não foi possível ler a versão mais recente',
      body: 'Tente de novo em alguns minutos.',
    },
    release: (version: string) => `Versão ${version}`,
    publishedAt: 'Publicada em',
    macos: {
      title: 'macOS',
      requirement: 'Para Macs com Apple Silicon (M1 ou mais novo).',
      download: 'Baixar para macOS (.dmg)',
      notPublished: 'O instalador ainda não foi publicado. Este botão é ativado quando a primeira versão sair.',
    },
    windows: {
      title: 'Windows',
      comingNext: 'Em breve. A versão para Windows é a próxima etapa.',
    },
    otherSystem: 'O studio roda em computadores Mac com Apple Silicon. Abra esta página no computador onde vai instalar.',
    missingAsset: 'Esta versão não traz instalador para esta plataforma.',
    size: 'Tamanho',
    file: 'Arquivo',
    sha256: 'SHA-256',
    sha256Hint: 'Confira no Terminal com: shasum -a 256 <arquivo>',
    ffmpeg: {
      title: 'Código-fonte do FFmpeg',
      body: (licence: string) => `O studio inclui o FFmpeg, distribuído sob a licença ${licence}. O código-fonte correspondente acompanha cada versão.`,
      link: 'Baixar o código-fonte do FFmpeg',
      missing: 'O código-fonte do FFmpeg não aparece nesta versão.',
    },
    gatekeeper: {
      title: 'Primeira abertura no Mac',
      intro: 'O app não é notarizado pela Apple, então o macOS pede uma confirmação na primeira vez.',
      steps: {
        drag: 'Abra o arquivo .dmg e arraste o app para Aplicativos.',
        firstOpen: 'Clique duas vezes no app em Aplicativos. O macOS recusa a abertura: feche o aviso, sem escolher Mover para o Lixo.',
        settings: 'Em até uma hora, abra o menu Apple > Ajustes do Sistema > Privacidade e Segurança (role a tela se preciso). Em Segurança, clique em Abrir Mesmo Assim.',
        password: 'Digite a senha de login e clique em OK.',
        later: 'Nas próximas vezes o app abre sem perguntar.',
      },
    },
  },
  footer: {
    privacy: 'Esta página não usa cookies nem estatísticas. O estado do studio é lido de 127.0.0.1 e não sai deste computador.',
  },
} as const;
