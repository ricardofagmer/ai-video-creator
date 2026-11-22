# Tela 01 — Layout privado e login

| Item | Valor |
| --- | --- |
| Rotas | `/login` (pública) e o grupo `app/(privado)` (todas as demais) |
| Título do documento | `Entrar · EngineOS Video Creator`; nas privadas, `<página> · EngineOS Video Creator` |
| Acesso | `/login` sem sessão; as privadas só com a sessão de senha (D8, critério 27) |
| Ticket | R1-19 |

## Objetivo

Entrar com a senha local e dar a todas as páginas privadas a mesma moldura: navegação entre
Catálogo, Receitas e Execuções, estado do watcher e saída.

## Wireframe — layout privado, desktop (a partir de `md`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [VC] EngineOS Video Creator   Catálogo  Receitas  [Execuções]      (• Watcher ativo) Sair │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   <conteúdo da página: PageHeader + blocos>                                │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Wireframe — layout privado, mobile (abaixo de `md`)

```
┌──────────────────────────────────┐
│ [VC] EngineOS Video Creator  (• Watcher) Sair│
│ Catálogo  Receitas  [Execuções] → │  navegação rola na horizontal
├──────────────────────────────────┤
│ <conteúdo>                        │
└──────────────────────────────────┘
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

- `AppShell` com `brand` = `Logo` dentro de um link para `/execucoes`; `navigation` = três links
  com `navLinkClassName({ active })` e `aria-current="page"` no ativo; `status` =
  `WatcherIndicator` (estado vindo da api, consultado a cada 1 s, A17); `actions` = Button
  `ghost` `sm` "Sair".
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
| Links de navegação | Catálogo · Receitas · Execuções |
| Botão de saída | Sair |
| Link de pular | Pular para o conteúdo |
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

Top bar em uma linha a partir de `md`; abaixo, navegação na segunda linha com rolagem
horizontal. O card de login ocupa a largura menos `--layout-gutter-mobile` de cada lado.

## Acessibilidade

- Ordem de foco: Pular para o conteúdo → Logo → navegação → Sair → conteúdo.
- O estado do watcher é `role="status"`: mudanças são anunciadas sem mover o foco.
- O Alert de senha errada é `role="alert"`; o campo recebe `aria-describedby` do erro.

## Componentes usados

`AppShell`, `navLinkClassName`, `Logo`, `WatcherIndicator`, `Button`, `Card`, `FormField`,
`Input`, `Alert`.
