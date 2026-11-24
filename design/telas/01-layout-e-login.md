# Tela 01 — Layout privado e login

| Item | Valor |
| --- | --- |
| Rotas | `/login` (pública) e o grupo `app/(privado)` (todas as demais) |
| Título do documento | `Entrar · EngineOS Video Creator`; nas privadas, `<página> · EngineOS Video Creator` |
| Acesso | `/login` sem sessão; as privadas só com a sessão de senha (D8, critério 27) |
| Ticket | R1-19 |

## Objetivo

Entrar com a senha local e dar a todas as páginas privadas a mesma moldura: navbar de uma linha
com o estado do watcher e uma gaveta de menu com a navegação agrupada (Conteúdo, Produção,
Publicação), as preferências (idioma e tema) e a conta, com a saída.

## Wireframe — layout privado, desktop (a partir de `md`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [≡] [VC] EngineOS Video Creator                         (• Watcher ativo) │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   <conteúdo da página: PageHeader + blocos>                                │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Wireframe — layout privado, mobile (abaixo de `md`)

```
┌──────────────────────────────────┐
│ [≡] [VC]            (• Watcher)   │  uma linha; o nome fica para leitores de tela
├──────────────────────────────────┤
│ <conteúdo>                        │
└──────────────────────────────────┘
```

## Wireframe — gaveta de menu (qualquer largura)

```
┌──────────────────────────────┐░░░░░░░░
│ Menu                     [×] │░ fundo ░  clique no fundo fecha
├──────────────────────────────┤░░░░░░░░
│ CONTEÚDO                     │░░░░░░░░  corpo com rolagem própria
│ [▭] Catálogo                 │░░░░░░░░
│ [▤] Receitas                 │░░░░░░░░
├──────────────────────────────┤░░░░░░░░  divisória de largura total
│ PRODUÇÃO                     │░░░░░░░░
│▌[▶] Execuções                │░ ativo ░
│ [◫] Comparações              │░░░░░░░░
│ [▦] Agendamentos             │░░░░░░░░
├──────────────────────────────┤░░░░░░░░
│ PUBLICAÇÃO                   │░░░░░░░░
│ [▥] Métricas                 │░░░░░░░░
│ [↗] Indicadores              │░░░░░░░░
│ [∞] Contas                   │░░░░░░░░
├──────────────────────────────┤░░░░░░░░
│ PREFERÊNCIAS                 │░░░░░░░░
│ [◎] Idioma     (BR)(ES)(US)  │░░░░░░░░
│ [☾] Tema       (▭)(☀)(☾)     │░░░░░░░░
├──────────────────────────────┤░░░░░░░░  rodapé fixo, sempre visível
│ (P) Proprietário          ⌄  │░░░░░░░░
│     Sessão até 23/11/2026…   │░░░░░░░░
│ [⇥] Sair                     │░░░░░░░░  menu da conta, aberto pelo chevron
└──────────────────────────────┘░░░░░░░░
```

## Wireframe — login

```
┌────────────────────────────────────────┐
│               [VC] EngineOS Video Creator        │
│  ┌──────────────────────────────────┐  │
│  │ Entrar                           │  │
│  │ Digite a senha deste Mac.        │  │
│  │                                  │  │
│  │ Senha                            │  │
│  │ [••••••••••••               ]    │  │
│  │                                  │  │
│  │ [            Entrar            ] │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

## Estrutura

### Bloco 1 — AppShell (privadas)

- `AppShell` com `brand` = `Logo compactBelowMd` dentro de um link para `/execucoes`;
  `navigation` = três `DrawerSection` (Conteúdo: Catálogo, Receitas; Produção: Execuções,
  Comparações, Agendamentos; Publicação: Métricas, Indicadores, Contas), cada link com
  `navLinkClassName({ active })`, um `Icon` e o rótulo, e `aria-current="page"` no ativo;
  `status` = `WatcherIndicator` (estado vindo da api, consultado a cada 1 s, A17);
  `preferences` = Idioma (`LanguageSwitch`) e Tema (`ThemeToggle`); `account` = nome
  "Proprietário", segunda linha "Sessão até {data e hora}" (o `expiresAt` de `GET /auth/session`)
  e, no menu da conta, a linha "Sair" (`drawerItemClassName`, mesmo `POST /auth/logout`). Não há
  prop `actions`.
- O estúdio tem um só dono, com senha; a sessão não traz nome nem e-mail, por isso o nome é o
  papel "Proprietário" e a inicial do avatar é "P".
- Página inicial depois do login: `/execucoes`.

### Bloco 2 — Login

- Página centralizada em `--color-bg`, Logo acima do card, margem superior `--space-12`.
- `Card` com largura máxima `--layout-auth-card-width`, título "Entrar" (`as="h1"`, aparência
  `heading-3`), descrição "Digite a senha deste Mac.".
- `FormField` "Senha" com `Input type="password"` e `autoComplete="current-password"`.
- Button `primary` `block` `type="submit"` "Entrar"; carregando: "Entrando…".
- Erro de senha: `Alert` `error` acima do campo.

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Grupos da gaveta | Conteúdo · Produção · Publicação · Preferências |
| Links de navegação | Catálogo · Receitas · Execuções · Comparações · Agendamentos · Métricas · Indicadores · Contas |
| Preferências | Idioma · Tema |
| Conta (rodapé da gaveta) | Proprietário · Sessão até {data e hora} |
| Menu da conta (rótulo do grupo) | Menu da conta |
| Saída (no menu da conta) | Sair |
| Link de pular | Pular para o conteúdo |
| Botão do menu | Abrir menu · Fechar menu |
| Título da gaveta | Menu |
| Título do login | Entrar |
| Descrição do login | Digite a senha deste Mac. |
| Rótulo | Senha |
| Botão | Entrar · Entrando… |
| Senha errada | Senha incorreta. Tente de novo. |
| Sessão expirada (Alert `info` no login) | Sua sessão terminou. Entre de novo para continuar. |
| Api fora do ar (Alert `error`) | Não foi possível falar com o serviço local. Verifique com `studio doctor`. |

## Estados

| Estado | Comportamento |
| --- | --- |
| Enviando | Botão carregando, campo desabilitado |
| Senha errada | Alert `error`, foco volta para o campo, campo limpo |
| Watcher sem resposta | `WatcherIndicator` "Watcher sem resposta"; o resto da página continua usável |
| Sem sessão em rota privada | Redireciona para `/login` com o Alert de sessão terminada |

## Responsividade

Navbar em uma linha em qualquer largura; abaixo de `md` a Logo mostra só o monograma. Navegação,
idioma, tema e "Sair" ficam na gaveta em todas as larguras. A gaveta ocupa a altura toda, com
largura `--layout-auth-card-width` limitada à janela menos `--space-12`; só o corpo rola e o
rodapé da conta fica sempre visível. Ao abrir, a largura de uma barra de rolagem clássica vira
`padding-right`, para a página não deslocar. O card de login ocupa a largura menos `--layout-gutter-mobile` de cada lado.

## Acessibilidade

- Ordem de foco: Pular para o conteúdo → botão de menu → Logo → status → conteúdo.
- Gaveta aberta: foco no botão de fechar, preso na gaveta; ordem fechar → links → Preferências →
  botão da conta → itens do menu da conta. Escape, clique no fundo ou num link fecham e o foco
  volta ao botão de menu. Com o menu da conta aberto, Escape fecha só esse menu e o foco volta ao
  botão da conta.
- Grupos com `role="group"` rotulados pelo título; ícones e avatar com `aria-hidden="true"`;
  botão da conta com `aria-expanded` e `aria-controls`.
- O estado do watcher é `role="status"`: mudanças são anunciadas sem mover o foco.
- O Alert de senha errada é `role="alert"`; o campo recebe `aria-describedby` do erro.

## Componentes usados

`AppShell`, `DrawerSection`, `navLinkClassName`, `drawerItemClassName`, `Icon`, `Logo`,
`LanguageSwitch`, `ThemeToggle`, `WatcherIndicator`, `Button`, `Card`, `FormField`,
`Input`, `Alert`.
