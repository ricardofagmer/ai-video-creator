# App do menu (EngineOS Video Creator)

Um ícone na barra de menus do macOS para ver se o estúdio está rodando e para ligar ou desligar a
web e a api sem abrir o Terminal. Não tem janela: o estúdio continua abrindo no seu navegador.
Decisão e detalhes técnicos: `docs/adr/0005-packaged-shell.md`.

## O que o menu mostra

Na barra de menus aparece o texto "Estúdio". Ao clicar:

- o estado do watcher (ativo, parado ou não iniciado), da api e da web (rodando, parada ou estado
  desconhecido);
- a próxima execução agendada, ou "Sem agendamentos ativos";
- quantas execuções estão em revisão ("Em revisão: N");
- as três ações, logo abaixo;
- "Abrir ao iniciar sessão" (liga ou desliga o app no login) e "Sair".

O estado é lido a cada 5 segundos; agendamentos e revisões, a cada minuto e sempre que o menu abre.

## As três ações

- **Iniciar**: liga a web e a api. É o mesmo que rodar `studio start`.
- **Parar**: desliga a web e a api. É o mesmo que rodar `studio stop`.
- **Abrir estúdio**: abre o estúdio no navegador padrão. Só fica ativo com a web rodando.

Uma ação por vez. Se uma ação passar de 1 minuto, o menu mostra "sem resposta" e espera; o app
nunca mata um processo.

O watcher não é controlado pelo app: ele continua com o launchd, volta sozinho depois de reiniciar o
Mac e segue rodando mesmo com o app fechado. O menu só mostra o estado dele.

Com "Abrir ao iniciar sessão" ligado, o app abre no login, mas não liga a web e a api sozinho:
depois de reiniciar o Mac, basta clicar em "Iniciar".

## Instalar, pular e remover

- **Instalar**: `scripts/install.sh`. A etapa 12 de 15 constrói o app. Antes, ela diz de onde o
  Electron será baixado (releases do GitHub de `electron/electron`) e pergunta se pode baixar; sem
  "s", nada é baixado e o resto da instalação segue. O app fica em `~/Applications/EngineOS Video Creator.app`.
  O instalador não abre o app nem liga "Abrir ao iniciar sessão": faça isso pelo menu.
- **Pular**: `scripts/install.sh --skip-shell`. O Electron não é baixado e o app não é empacotado
  nem copiado. O código do app (`dist/main.js`) ainda é compilado na etapa 5, junto com o resto
  do workspace.
- **Remover**: `scripts/uninstall.sh`. Desliga o login, fecha o app e apaga só o app com o bundle id
  `com.videostudio.shell`. O cache de download do Electron (`~/Library/Caches/electron`) não é
  apagado, porque outros apps podem usá-lo; o desinstalador mostra o comando para apagá-lo à mão.

Se uma falha acontecer na etapa do app, o instalador avisa no resumo e o resto do estúdio funciona
normalmente.

Limite conhecido: a etapa 5 (`turbo run build`) compila todos os pacotes, `@studio/shell`
incluído. Se a compilação do código do app falhar ali, a instalação inteira para, mesmo com
`--skip-shell`, porque essa etapa vem antes da etapa 12 e não sabe pular pacotes.

## Privacidade e atualizações

- Nada sai do Mac: o código do app não abre porta, não faz requisição para fora e não tem
  telemetria (a conferência no seu Mac ainda está pendente, veja "Bom saber"). A única coisa que
  ele passa ao navegador é o endereço local `http://127.0.0.1:<porta da web>/`.
- O app não guarda senha nem chave. A senha do estúdio é digitada no navegador.
- Não há atualização automática. Atualizações chegam pelo repositório: atualize o checkout e rode
  `scripts/install.sh` de novo, que reconstrói o app quando algo mudou (e pergunta de novo antes de
  baixar).

## Bom saber

- A api ligada pelo app roda com os provedores em modo simulado (o padrão da api): ela não recebe
  as variáveis de modo simulado ou real do seu Terminal. Para ligar a api com essas variáveis, use
  `studio start` no Terminal.
- Se o seu `.npmrc` tiver uma entrada `electron_*` (por exemplo, um espelho de download), o build
  do app recusa rodar e a etapa é pulada com um aviso. Remova a entrada e rode `scripts/install.sh`
  de novo.
- Na primeira vez que o instalador ou o desinstalador fecha o app, o macOS pode pedir uma única vez
  permissão de Automação para o Terminal.
- Ainda falta conferir no seu Mac, depois do primeiro build: que o app não abre nenhuma conexão,
  quanto ocupa em disco e em memória, e que o macOS abre o app sem aviso do Gatekeeper. Essas
  conferências são suas, na etapa final; até lá, estão pendentes.
